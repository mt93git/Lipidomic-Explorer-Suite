/* Lipidomic Explorer help manual: search, rendering and page behaviour. Plain script, no dependencies.

   Part 1 (HelpSearch) has no DOM in it and also runs in Node: tools/build-search-index.mjs imports this file and
   writes search-index.json with the same code the page uses when it has to build the index itself (opened from
   disk, or when the index on the server is missing or older than the content).

   The page never sets innerHTML, inline styles or inline handlers, so it runs under a strict Content-Security-Policy
   (script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'). */
(function (root) {
  'use strict';

  /* ---------- Part 1: search core ---------- */

  // Words that say nothing about a page, among them the ones a question starts with ("how do I…", "where is my…").
  var STOP_WORDS = ' a about am an and are as at be but by can could did do does for from get has have how i if in into is it its me my not of on or our please should so than that the their them then there these they this to us was we were what when where which who why will with would you your ';
  var WEIGHTS = { title: 6, labels: 3, text: 1 };
  var FIELDS = ['title', 'labels', 'text'];
  var EXACT = 1, SAME = 0.9, PREFIX = 0.75, FUZZY = 0.4;
  var ENDINGS = ' s es ed d ing e ion ions ation ations ', PLURALS = ' s es ';
  var INLINE = '\\*\\*([^*]+)\\*\\*|`([^`]+)`|\\[([^\\]]+)\\]\\(#([^)\\s]+)\\)';   // **bold**, `code`, [label](#id)
  var WORD = '[A-Za-z0-9\\u00C0-\\u024F]+';
  var ACCENTS = new RegExp('[\\u0300-\\u036f]', 'g');             // what is left of an accent after normalize('NFD')
  var POSSESSIVE = new RegExp("[\\u2019']s\\b", 'g'), APOSTROPHE = new RegExp("[\\u2019']", 'g');

  function isStop(word) { return STOP_WORDS.indexOf(' ' + word + ' ') >= 0; }

  // Copy strings carry a little inline markup; this is the same text without it.
  function plain(text) {
    return String(text == null ? '' : text).replace(new RegExp(INLINE, 'g'), function (all, bold, code, label) { return bold || code || label; });
  }

  // Lower case, no accents, no possessive: “Client’s” and "clients" both search as "client…".
  function fold(text) {
    return String(text).toLowerCase().normalize('NFD').replace(ACCENTS, '').replace(POSSESSIVE, '').replace(APOSTROPHE, '');
  }

  function words(text) { return fold(text).match(/[a-z0-9]+/g) || []; }

  function tokens(lines) {
    var seen = Object.create(null);
    lines.forEach(function (line) {
      words(plain(line)).forEach(function (word) { if (word.length > 1 && !isStop(word)) seen[word] = true; });
    });
    return Object.keys(seen).sort();
  }

  // The app's own names: everything the copy sets in bold.
  function bolds(lines) {
    var out = [];
    lines.forEach(function (line) {
      String(line || '').replace(/\*\*([^*]+)\*\*/g, function (all, bold) { out.push(bold); return all; });
    });
    return out;
  }

  // One searchable document per place a reader can land on: the cycle, the roles, each part and each step.
  function collect(content) {
    var ui = content.ui || {}, docs = [], roles = content.roles || [], roleLabel = Object.create(null);
    roles.forEach(function (role) { roleLabel[role.id] = role.label; });

    if (content.cycle) {
      docs.push({
        id: 'cycle', kind: 'overview', part: ui.overview || '', title: content.cycle.title, keys: [],
        labels: content.cycle.stages.map(function (stage) { return stage.title; }),
        lines: [content.cycle.intro].concat(content.cycle.stages.map(function (stage) {
          return stage.title + '. ' + stage.text + (stage.clientSees ? ' ' + ui.clientSees + ': ' + stage.clientSees + '.' : '');
        })),
        extra: []
      });
    }
    if (roles.length) {
      docs.push({
        id: 'roles', kind: 'overview', part: ui.overview || '', title: ui.rolesTitle || '', labels: [], extra: [],
        keys: roles.map(function (role) { return role.label; }),
        lines: roles.map(function (role) { return role.label + ': ' + role.about; })
      });
    }
    (content.parts || []).forEach(function (part, i, parts) {
      docs.push({
        id: part.id, kind: 'part', part: (ui.partOf || '').replace('{n}', i + 1).replace('{total}', parts.length), title: part.label, keys: part.keywords || [],
        labels: [part.title, part.app].concat(bolds(part.notes || [])),
        lines: [part.summary, part.what, part.who].concat(part.notes || []), extra: []
      });
      part.steps.forEach(function (step) {
        var lines = [step.what, step.when].concat(step.steps || [], step.notes || [], step.whoNote ? [step.whoNote] : []);
        docs.push({
          id: part.id + '/' + step.slug, kind: 'step', part: part.label, title: step.title, updating: !!step.updating, keys: step.keywords || [],
          labels: (step.who || []).map(function (id) { return roleLabel[id] || ''; }).concat(bolds(lines)),
          lines: lines, extra: (step.shots || []).map(function (shot) { return (shot.caption || '') + ' ' + (shot.alt || ''); })
        });
      });
    });
    return docs;
  }

  // search-index.json: three token lists per document. Titles weigh most (with the "keywords" of a part or step:
  // words a reader may type that the app does not use, such as "login"), then the app's names and roles, then the text.
  function buildIndex(content, source) {
    return {
      version: 2,
      source: source || '',
      entries: collect(content).map(function (doc) {
        return { id: doc.id, phrase: words(plain(doc.title)).filter(function (word) { return !isStop(word); }).join(' '),
          title: tokens([doc.title].concat(doc.keys)), labels: tokens(doc.labels), text: tokens(doc.lines.concat(doc.extra)) };
      })
    };
  }

  // How many typing mistakes a search word may hold. Short words must match as typed: one changed letter makes
  // another word of them ("fail", "file").
  function slack(length) { return length <= 4 ? 0 : length <= 7 ? 1 : 2; }

  // Fewest typing mistakes (a letter missing, added or wrong, or two letters swapped) between the term and any
  // beginning of the word.
  function prefixDistance(term, word) {
    var before = null, previous = [], current, best, i, j;
    for (j = 0; j <= word.length; j++) previous[j] = j;
    for (i = 1; i <= term.length; i++) {
      current = [i];
      for (j = 1; j <= word.length; j++) {
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (term.charCodeAt(i - 1) === word.charCodeAt(j - 1) ? 0 : 1));
        if (before && j > 1 && term.charCodeAt(i - 1) === word.charCodeAt(j - 2) && term.charCodeAt(i - 2) === word.charCodeAt(j - 1)) {
          current[j] = Math.min(current[j], before[j - 2] + 1);
        }
      }
      before = previous;
      previous = current;
    }
    best = previous[0];
    for (j = 1; j <= word.length; j++) if (previous[j] < best) best = previous[j];
    return best;
  }

  // One word in two forms: "batches" and "batch", "releasing" and "release", "invitation" and "invite". The two
  // start alike and what is left of each is nothing or a common English ending. Three shared letters are enough
  // for a plural ("run", "runs"); any other ending needs four, so that "see" is not "seed".
  function ending(rest, list) { return !rest || list.indexOf(' ' + rest + ' ') >= 0; }
  function sameWord(a, b) {
    var n = 0, max, restA, restB;
    a = a.replace(/ie([sd])$/, 'y$1');              // policies and copied end like policy and copy
    b = b.replace(/ie([sd])$/, 'y$1');
    max = Math.min(a.length, b.length);
    while (n < max && a.charCodeAt(n) === b.charCodeAt(n)) n++;
    restA = a.slice(n);
    restB = b.slice(n);
    if (n < 3 || !ending(restA, ENDINGS) || !ending(restB, ENDINGS)) return false;
    return n > 3 || (ending(restA, PLURALS) && ending(restB, PLURALS));
  }

  // 1 for the word as typed, a little less for another form of it, less for "starts with", less again for a near
  // miss (only when fuzzy is asked for), 0 for no match.
  function quality(term, word, fuzzy) {
    if (word === term) return EXACT;
    if (sameWord(term, word)) return SAME;
    if (word.length > term.length && word.lastIndexOf(term, 0) === 0) return PREFIX;
    if (!fuzzy) return 0;
    var max = slack(term.length);
    if (!max || word.charCodeAt(0) !== term.charCodeAt(0) || word.length < term.length - max) return 0;
    return prefixDistance(term, word.slice(0, term.length + max)) <= max ? FUZZY : 0;
  }

  function scoreTerm(index, term, fuzzy) {
    var any = false;
    var scores = index.entries.map(function (entry) {
      var total = 0;
      FIELDS.forEach(function (field) {
        var list = entry[field] || [], best = 0, i, q;
        for (i = 0; i < list.length && best < EXACT; i++) { q = quality(term, list[i], fuzzy); if (q > best) best = q; }
        total += best * WEIGHTS[field];
      });
      if (total > 0) any = true;
      return total;
    });
    return { any: any, scores: scores };
  }

  // Every word must match (as typed, or as the start of a word). A word that matches nothing at all is tried again
  // as a typing mistake. If no document holds every word, documents holding some of them are returned instead.
  function search(index, query) {
    var typed = words(query), kept = typed.filter(function (word) { return !isStop(word); });
    var terms = (kept.length ? kept : typed).filter(function (word, i, all) { return all.indexOf(word) === i; }).slice(0, 8);
    if (!index || !terms.length) return { terms: [], hits: [] };

    var scored = terms.map(function (term) {
      var result = scoreTerm(index, term, false), fuzzy = false;
      if (!result.any && slack(term.length)) { result = scoreTerm(index, term, true); fuzzy = true; }
      return { term: term, fuzzy: fuzzy, scores: result.scores };
    });
    var rows = index.entries.map(function (entry, order) {
      var matched = 0, score = 0;
      scored.forEach(function (one) { if (one.scores[order] > 0) { matched++; score += one.scores[order]; } });
      // Prefer the step the reader named: "Request an order" must outrank "Accept a client's order request".
      if (matched === terms.length && entry.phrase === terms.join(' ')) score += 12;
      return { id: entry.id, order: order, matched: matched, score: score };
    });
    var all = rows.filter(function (row) { return row.matched === terms.length; });
    var hits = (all.length ? all : rows.filter(function (row) { return row.matched > 0; })).sort(function (a, b) {
      return b.matched - a.matched || b.score - a.score || a.order - b.order;
    });
    return {
      terms: scored.map(function (one) { return { term: one.term, fuzzy: one.fuzzy }; }),
      partial: !all.length && hits.length > 0,
      hits: hits.map(function (row) { return { id: row.id, score: Math.round(row.score * 100) / 100, matched: row.matched }; })
    };
  }

  // Cuts a line into [{ text, hit }] pieces, hit marking the words a search matched.
  function pieces(line, terms) {
    var out = [], word = new RegExp(WORD, 'g'), last = 0, match, folded, hit;
    while ((match = word.exec(line))) {
      folded = fold(match[0]);
      hit = terms.some(function (one) { return quality(one.term, folded, one.fuzzy) > 0; });
      if (!hit) continue;
      if (match.index > last) out.push({ text: line.slice(last, match.index), hit: false });
      out.push({ text: match[0], hit: true });
      last = match.index + match[0].length;
    }
    if (last < line.length) out.push({ text: line.slice(last), hit: false });
    return out;
  }

  // The line of a document that holds the most of the searched words (the earliest such line), shortened around
  // the first of them; or the first line when no line holds any.
  function snippet(lines, terms, width) {
    var max = width || 150, most = 0, line = plain(lines[0] || ''), parts, first, start, end, text;
    lines.forEach(function (raw) {
      var candidate = plain(raw), inLine = words(candidate);
      var count = terms.filter(function (one) {
        return inLine.some(function (word) { return quality(one.term, word, one.fuzzy) > 0; });
      }).length;
      if (count > most) { most = count; line = candidate; }
    });
    parts = most ? pieces(line, terms) : [{ text: line, hit: false }];
    if (line.length <= max) return parts;

    first = parts[0].hit || parts.length === 1 ? 0 : parts[0].text.length;
    start = Math.max(0, first - 48);
    if (start > 0) { start = line.indexOf(' ', start) + 1; if (start <= 0 || start > first) start = first; }
    end = Math.min(line.length, start + max);
    if (end < line.length) { end = line.lastIndexOf(' ', end); if (end <= start) end = Math.min(line.length, start + max); }
    text = line.slice(start, end).replace(/[\s,;:]+$/, '');
    parts = pieces(text, terms);
    if (start > 0) parts.unshift({ text: '… ', hit: false });
    if (end < line.length) parts.push({ text: ' …', hit: false });
    return parts;
  }

  var HelpSearch = { plain: plain, fold: fold, words: words, tokens: tokens, collect: collect, buildIndex: buildIndex, search: search, snippet: snippet, INLINE: INLINE };
  root.HelpSearch = HelpSearch;
  if (typeof module === 'object' && module && module.exports) module.exports = HelpSearch;
  if (typeof document === 'undefined') return;

  /* ---------- Part 2: building the page from HELP_DATA ---------- */

  var doc = document, win = window;
  var data = win.HELP_DATA;                 // help-data.js: content.json plus the list of screenshot files that exist
  var main = doc.getElementById('main');

  if (!data || !data.content) {
    main.appendChild(doc.createElement('p')).className = 'noscript';
    main.lastChild.textContent = 'This manual could not load its content.';
    if (win.console) win.console.error('Help manual: help-data.js is missing. Run: node tools/build-search-index.mjs');
    return;
  }

  var content = data.content, ui = content.ui, meta = content.meta;
  var roleById = Object.create(null);
  content.roles.forEach(function (role) { roleById[role.id] = role; });
  var printing = false;                     // once the reader prints, pictures are no longer loaded lazily
  var have = { desktop: Object.create(null), mobile: Object.create(null) };   // screenshot file name (no extension) → true
  ['desktop', 'mobile'].forEach(function (folder) {
    ((data.screenshots || {})[folder] || []).forEach(function (file) { have[folder][file] = true; });
  });

  function el(tag, attrs, children) {
    var node = doc.createElement(tag), key, value;
    for (key in attrs || {}) {
      value = attrs[key];
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
    });
    return node;
  }

  function each(selector, fn, scope) { Array.prototype.forEach.call((scope || doc).querySelectorAll(selector), fn); }

  function fill(template, values) {
    return String(template).replace(/\{(\w+)\}/g, function (all, key) { return key in values ? values[key] : all; });
  }

  // **bold**, `code` and [label](#id) become elements; everything else stays text.
  function rich(text) {
    var out = doc.createDocumentFragment(), pattern = new RegExp(HelpSearch.INLINE, 'g'), last = 0, match;
    text = String(text == null ? '' : text);
    while ((match = pattern.exec(text))) {
      if (match.index > last) out.appendChild(doc.createTextNode(text.slice(last, match.index)));
      if (match[1]) out.appendChild(el('strong', { text: match[1] }));
      else if (match[2]) out.appendChild(el('code', { text: match[2] }));
      else out.appendChild(el('a', { href: '#' + match[4], text: match[3] }));
      last = pattern.lastIndex;
    }
    if (last < text.length) out.appendChild(doc.createTextNode(text.slice(last)));
    return out;
  }

  function titleOf(id) {
    var found = '';
    content.parts.forEach(function (part) {
      if (part.id === id) found = part.label;
      part.steps.forEach(function (step) { if (part.id + '/' + step.slug === id) found = step.title; });
    });
    return found || id;
  }

  // The strings index.html ships with are only what shows before this script runs.
  function applyStrings() {
    doc.documentElement.lang = meta.lang || 'en';
    doc.title = meta.documentTitle;
    each('[data-ui]', function (node) { var text = ui[node.getAttribute('data-ui')]; if (text) node.textContent = text; });
    each('[data-meta]', function (node) { var text = meta[node.getAttribute('data-meta')]; if (text) node.textContent = text; });
    each('[data-ui-label]', function (node) { var text = ui[node.getAttribute('data-ui-label')]; if (text) node.setAttribute('aria-label', text); });
    each('[data-ui-placeholder]', function (node) { var text = ui[node.getAttribute('data-ui-placeholder')]; if (text) node.setAttribute('placeholder', text); });
    each('meta[name="description"]', function (node) { node.setAttribute('content', HelpSearch.plain(meta.lede)); });
  }

  function section(id, eyebrow, title, extra) {
    return el('section', { class: 'section' + (extra ? ' ' + extra : ''), id: id, 'aria-labelledby': 'h-' + id }, [
      el('div', { class: 'section-head' }, [el('p', { class: 'eyebrow', text: eyebrow }), el('h2', { id: 'h-' + id, text: title })])
    ]);
  }

  function renderHero() {
    var total = content.parts.length;
    return [
      el('header', { class: 'hero' }, [
        el('p', { class: 'eyebrow', text: meta.eyebrow }),
        el('h1', { text: meta.title }),
        el('p', { class: 'lede' }, [rich(meta.lede)])
      ]),
      el('nav', { class: 'chooser', 'aria-label': ui.chooseTitle }, content.parts.map(function (part, i) {
        return el('a', { class: 'choice', href: '#' + part.id }, [
          el('span', { class: 'eyebrow', text: fill(ui.partOf, { n: i + 1, total: total }) }),
          el('span', { class: 'choice-title', text: part.label }),
          el('span', { class: 'choice-text' }, [rich(part.summary)]),
          el('span', { class: 'choice-go' }, [fill(ui.stepsCount, { n: part.steps.length }), el('span', { 'aria-hidden': 'true', text: ' →' })])
        ]);
      }))
    ];
  }

  function renderCycle() {
    var cycle = content.cycle, node = section('cycle', ui.overview, cycle.title, 'cycle-section');
    var sides = { client: ui.sideClient, lab: ui.sideLab, both: ui.sideBoth };
    node.appendChild(el('p', { class: 'section-intro' }, [rich(cycle.intro)]));
    node.appendChild(el('div', { class: 'lanes', 'aria-hidden': 'true' }, [
      el('span', { class: 'lane client', text: ui.sideClient }), el('span', { class: 'lane lab', text: ui.sideLab })
    ]));
    node.appendChild(el('ol', { class: 'cycle', role: 'list' }, cycle.stages.map(function (stage, i) {
      var card = el('div', { class: 'stage-card' }, [
        el('span', { class: 'stage-side', text: sides[stage.side] }),
        el('a', { class: 'stage-title', href: '#' + stage.links[0], text: stage.title }),
        el('p', { class: 'stage-text' }, [rich(stage.text)])
      ]);
      var more = stage.links.slice(1), extra;
      if (stage.clientSees || more.length) {
        extra = card.appendChild(el('p', { class: 'stage-meta' }));
        if (stage.clientSees) extra.appendChild(el('span', { class: 'pill client', text: ui.clientSees + ': ' + stage.clientSees }));
        if (more.length) {
          extra = extra.appendChild(el('span', { class: 'stage-more' }, [ui.seeAlso + ': ']));
          more.forEach(function (id, n) {
            if (n) extra.appendChild(doc.createTextNode(', '));
            extra.appendChild(el('a', { href: '#' + id, text: titleOf(id) }));
          });
        }
      }
      return el('li', { class: 'stage ' + stage.side }, [el('span', { class: 'stage-dot', 'aria-hidden': 'true', text: String(i + 1) }), card]);
    })));
    node.appendChild(el('h3', { class: 'subhead', id: 'roles', text: ui.rolesTitle }));
    node.appendChild(el('dl', { class: 'roles' }, content.roles.map(function (role) {
      return el('div', {}, [el('dt', {}, [el('span', { class: 'pill ' + role.side, text: role.label })]), el('dd', {}, [rich(role.about)])]);
    })));
    return node;
  }

  function renderPart(part, index) {
    var node = section(part.id, fill(ui.partOf, { n: index + 1, total: content.parts.length }), part.label);
    node.appendChild(el('p', { class: 'section-intro' }, [rich(part.summary)]));
    node.appendChild(el('div', { class: 'panel' }, [
      el('dl', { class: 'part-facts' }, [
        el('div', {}, [el('dt', { text: ui.partFor }), el('dd', {}, [rich(part.what)])]),
        el('div', {}, [el('dt', { text: ui.partWho }), el('dd', {}, [rich(part.who)])])
      ]),
      el('ul', { class: 'part-notes', role: 'list' }, (part.notes || []).map(function (note) { return el('li', {}, [rich(note)]); }))
    ]));
    part.steps.forEach(function (step, i) { node.appendChild(renderStep(part, step, i)); });
    return node;
  }

  function renderStep(part, step, i) {
    var id = part.id + '/' + step.slug, titleId = 't-' + part.id + '-' + step.slug;
    var eyebrow = el('p', { class: 'eyebrow' }, [
      el('span', { text: part.label }),
      el('span', { 'aria-hidden': 'true', text: '·' }),
      el('span', { text: fill(ui.stepOf, { n: i + 1, total: part.steps.length }) })
    ]);
    var who = el('dd', {}, [el('ul', { class: 'who', role: 'list' }, (step.who || []).map(function (roleId) {
      var role = roleById[roleId] || { side: '', label: roleId };
      return el('li', { class: 'pill ' + role.side, text: role.label });
    }))]);
    if (step.whoNote) who.appendChild(el('p', { class: 'who-note' }, [rich(step.whoNote)]));

    return el('article', { class: 'step', id: id, 'aria-labelledby': titleId }, [
      el('div', { class: 'step-head' }, [
        el('div', {}, [eyebrow, el('h3', { class: 'step-title', id: titleId, text: step.title })]),
        el('a', { class: 'step-anchor', href: '#' + id, 'aria-label': ui.copyLink + ': ' + step.title, title: ui.copyLink, text: '#' })
      ]),
      step.updating && el('p', { class: 'updating-note', text: ui.updatingNote }),
      el('dl', { class: 'facts' }, [
        el('dt', { text: ui.what }), el('dd', {}, [rich(step.what)]),
        el('dt', { text: ui.who }), who,
        el('dt', { text: ui.when }), el('dd', {}, [rich(step.when)])
      ]),
      el('ol', { class: 'how', role: 'list', 'aria-label': ui.how }, (step.steps || []).map(function (line) {
        return el('li', {}, [el('span', { class: 'how-text' }, [rich(line)])]);
      })),
      step.notes && step.notes.length && el('div', { class: 'notes' }, [
        el('p', { class: 'notes-title', text: ui.notes }),
        el('ul', { role: 'list' }, step.notes.map(function (note) { return el('li', {}, [rich(note)]); }))
      ]),
      renderShots(step)
    ]);
  }

  /* Screenshots. A step shows one to three of them ("shots" in content.json), each a figure with a caption and, when
     both exist, a desktop and a phone view. An <img> is only created for a file help-data.js lists, so a screenshot
     that does not exist yet costs no request and no console error: it shows as a drawn placeholder instead. */

  function placeholder(step, shot, phone) {
    return el('div', { class: 'shot-missing', role: 'img', 'aria-label': ui.shotMissing + '. ' + (phone ? ui.shotPhoneAlt + ' ' : '') + shot.alt }, [
      el('div', { class: 'wire' }, [
        el('span', { class: 'wire-top' }),
        el('span', { class: 'wire-side' }, [el('i'), el('i'), el('i'), el('i')]),
        el('span', { class: 'wire-body' }, [el('i'), el('i'), el('i'), el('i'), el('i')])
      ]),
      el('div', { class: 'shot-missing-label' }, [
        el('span', { class: 'eyebrow', text: ui.shotMissing }),
        el('span', { class: 'shot-missing-name', text: shot.caption || step.title })
      ])
    ]);
  }

  // A screenshot taller than the frame is cut with a fade; the link under it opens the whole image.
  function fit(img) {
    if (img.offsetHeight) img.parentNode.classList.toggle('is-tall', img.offsetHeight > 640);
  }

  function renderPane(step, shot, kind, figure) {
    var phone = kind === 'phone', folder = phone ? 'mobile' : 'desktop';
    var pane = el('div', { class: 'shot-pane shot-pane--' + kind });
    function missing() {                          // listed but not there after all: draw the figure again without it
      have[folder][shot.file] = false;
      if (figure.parentNode) figure.parentNode.replaceChild(renderShot(step, shot), figure);
    }
    if (!have[folder][shot.file]) { pane.classList.add('is-missing'); pane.appendChild(placeholder(step, shot, phone)); return pane; }

    var src = 'screenshots/' + folder + '/' + shot.file + '.webp';
    var size = ((data.imageSizes || {})[folder] || {})[shot.file];
    var img = el('img', { alt: (phone ? ui.shotPhoneAlt + ' ' : '') + shot.alt, loading: printing ? 'eager' : 'lazy', decoding: 'async',
      width: size && size[0], height: size && size[1] });
    img.addEventListener('load', function () { fit(img); });
    img.addEventListener('error', missing);
    img.setAttribute('src', src);
    pane.appendChild(el('div', { class: 'shot-frame' }, [img]));
    pane.appendChild(el('a', { class: 'shot-full', href: src, 'aria-label': ui.shotFull + ': ' + HelpSearch.plain(shot.caption || step.title), text: ui.shotFull }));
    return pane;
  }

  function renderShot(step, shot) {
    var desktop = !!have.desktop[shot.file], phone = !!have.mobile[shot.file];
    var figure = el('figure', { class: 'shot' });
    // The caption and the desktop/phone switch share one bar: a <figcaption> may hold both.
    var bar = el('figcaption', { class: 'shot-bar' }, [shot.caption && el('span', { class: 'shot-caption' }, [rich(shot.caption)])]);
    if (desktop && phone) {
      bar.appendChild(el('div', { class: 'seg', role: 'group', 'aria-label': ui.shotView + ': ' + HelpSearch.plain(shot.caption || step.title) }, [
        el('button', { type: 'button', 'data-show': 'desktop', 'aria-pressed': 'false', text: ui.shotDesktop }),
        el('button', { type: 'button', 'data-show': 'phone', 'aria-pressed': 'false', text: ui.shotPhone })
      ]));
    } else if (desktop) figure.setAttribute('data-view', 'desktop');
    else if (phone) figure.setAttribute('data-view', 'phone');
    else figure.classList.add('is-empty');
    if (bar.childNodes.length) figure.appendChild(bar);
    if (desktop || !phone) figure.appendChild(renderPane(step, shot, 'desktop', figure));
    if (phone || !desktop) figure.appendChild(renderPane(step, shot, 'phone', figure));
    return figure;
  }

  function renderShots(step) {
    var shots = step.shots || [];
    return el('div', { class: 'shots' + (shots.length > 1 ? ' shots--many' : '') }, shots.map(function (shot) { return renderShot(step, shot); }));
  }

  function renderToc() {
    var toc = doc.getElementById('toc');
    function link(id, number, label, updating) {
      return el('li', {}, [el('a', { class: 'toc-link', href: '#' + id }, [
        el('span', { class: 'toc-num', 'aria-hidden': 'true', text: number }),
        el('span', { class: 'toc-label', text: label }),
        updating && el('span', { class: 'toc-tag', text: ui.updating })
      ])]);
    }
    toc.appendChild(el('ul', { class: 'toc-top', role: 'list' }, [link('cycle', '', content.cycle.title), link('roles', '', ui.rolesTitle)]));
    content.parts.forEach(function (part) {
      toc.appendChild(el('div', { class: 'toc-group' }, [
        el('a', { class: 'toc-heading', href: '#' + part.id, text: part.label }),
        el('ol', { role: 'list' }, part.steps.map(function (step, i) { return link(part.id + '/' + step.slug, String(i + 1), step.title, step.updating); }))
      ]));
    });
  }

  function renderFooter() {
    var footer = doc.getElementById('footer');
    footer.appendChild(el('p', { text: ui.footer }));
    footer.appendChild(el('p', {}, [fill(ui.updated, { date: meta.updated }), el('a', { class: 'footer-top', href: '#top', text: ui.top })]));
  }

  applyStrings();
  (function () {
    var page = doc.createDocumentFragment();
    renderHero().forEach(function (node) { page.appendChild(node); });
    page.appendChild(renderCycle());
    content.parts.forEach(function (part, i) { page.appendChild(renderPart(part, i)); });
    main.appendChild(page);
    renderToc();
    renderFooter();
  })();

  /* ---------- Part 3: behaviour ---------- */

  var sidebar = doc.getElementById('sidebar'), scrim = doc.getElementById('scrim'), toc = doc.getElementById('toc');
  var menuButton = doc.getElementById('menu-button'), menuLabel = doc.getElementById('menu-label');
  var input = doc.getElementById('q'), status = doc.getElementById('search-status'), results = doc.getElementById('results');
  var clearButton = doc.getElementById('search-clear'), searchKey = doc.getElementById('search-key');
  var narrow = win.matchMedia('(max-width: 760px)');
  var menuOpen = false;

  /* The menu (phones): the sidebar drops from the top bar. */

  function setMenu(open) {
    menuOpen = open;
    sidebar.classList.toggle('is-open', open);
    scrim.hidden = !open;
    menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuLabel.textContent = open ? ui.menuClose : ui.menuOpen;
    each('path', function (path) { path.setAttribute('d', open ? 'M3 3l10 10M13 3 3 13' : 'M2 4h12M2 8h12M2 12h12'); }, menuButton);
  }

  menuButton.addEventListener('click', function () { setMenu(!menuOpen); });
  scrim.addEventListener('click', function () { setMenu(false); menuButton.focus(); });
  // Every in-page link moves keyboard focus with the reader, including desktop search and repeated links.
  doc.addEventListener('click', function (event) {
    var link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    var id;
    try { id = decodeURIComponent(link.getAttribute('href').slice(1)); } catch (error) { return; }
    var node = doc.getElementById(id);
    if (!node) return;
    setMenu(false);
    var heading = node === main ? main : /^H[1-6]$/.test(node.tagName) ? node : node.querySelector('h1, h2, h3') || node;
    heading.setAttribute('tabindex', '-1');
    // Let native fragment navigation supply history first, then focus the heading rather than the article.
    win.requestAnimationFrame(function () { heading.focus({ preventScroll: true }); node.scrollIntoView(); });
  });
  doc.addEventListener('focusin', function (event) {
    if (menuOpen && !sidebar.contains(event.target) && !event.target.closest('.topbar')) setMenu(false);
  });

  /* Screenshot view: follows the screen width until the reader picks one. */

  function syncView(figure) {
    var view = figure.getAttribute('data-view') || (narrow.matches ? 'phone' : 'desktop');
    each('button[data-show]', function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-show') === view ? 'true' : 'false');
    }, figure);
    each('.shot-frame img', fit, figure);
  }

  main.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-show]');
    if (!button) return;
    var figure = button.closest('.shot');
    figure.setAttribute('data-view', button.getAttribute('data-show'));
    syncView(figure);
  });

  function onNarrowChange() {
    if (!narrow.matches) setMenu(false);
    each('.shot', syncView);
  }
  if (narrow.addEventListener) narrow.addEventListener('change', onNarrowChange); else narrow.addListener(onNarrowChange);
  each('.shot', syncView);

  var resizeTimer = 0;
  win.addEventListener('resize', function () {
    win.clearTimeout(resizeTimer);
    resizeTimer = win.setTimeout(function () { each('.shot-frame img', fit); }, 150);
  });

  /* Where the reader is: the Contents mark the part or step at the top of the window. */

  var spots = [];
  each('#toc a[href^="#"]', function (link) {
    var node = doc.getElementById(link.getAttribute('href').slice(1));
    if (node) spots.push({ node: node, link: link });
  });
  var currentLink = null, spyQueued = false, topbar = doc.querySelector('.topbar');

  function spy() {
    spyQueued = false;
    var line = topbar.offsetHeight + 40, page = doc.documentElement, found = null, i;
    for (i = 0; i < spots.length; i++) {
      if (spots[i].node.getBoundingClientRect().top <= line) found = spots[i].link; else if (found) break;
    }
    if (spots.length && win.innerHeight + win.pageYOffset >= page.scrollHeight - 2 && page.scrollHeight > win.innerHeight) {
      found = spots[spots.length - 1].link;          // the last step may be too short to reach the top
    }
    if (found === currentLink) return;
    if (currentLink) currentLink.removeAttribute('aria-current');
    currentLink = found;
    if (!found) return;
    found.setAttribute('aria-current', 'location');
    if (narrow.matches || toc.hidden) return;
    var box = sidebar.getBoundingClientRect(), rect = found.getBoundingClientRect();   // keep it in sight in the sidebar
    if (rect.top < box.top + 64) sidebar.scrollTop -= box.top + 64 - rect.top;
    else if (rect.bottom > box.bottom - 28) sidebar.scrollTop += rect.bottom - box.bottom + 28;
  }
  function queueSpy() { if (!spyQueued) { spyQueued = true; win.requestAnimationFrame(spy); } }
  win.addEventListener('scroll', queueSpy, { passive: true });
  win.addEventListener('resize', queueSpy);

  /* Deep links: #lab/receive-shipment. The id holds a slash, which is fine for a fragment. */

  function target() {
    var id;
    try { id = decodeURIComponent(win.location.hash.replace(/^#/, '')); } catch (error) { return null; }
    return id ? doc.getElementById(id) : null;
  }

  function showTarget(scroll) {
    var node = target();
    each('.step.is-target', function (step) { step.classList.remove('is-target'); });
    if (node && node.classList.contains('step')) node.classList.add('is-target');
    if (node && scroll) node.scrollIntoView();
    queueSpy();
  }

  win.addEventListener('hashchange', function () { setMenu(false); showTarget(false); });
  showTarget(true);                                   // the browser looked for the id before the page was built
  if (target()) {                                     // and fonts or pictures arriving later may move it: settle once more
    var settled = false, settle = function () { if (!settled) { settled = true; showTarget(true); } };
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (type) {
      win.addEventListener(type, function () { settled = true; }, { passive: true, once: true });
    });
    win.addEventListener('load', function () { win.setTimeout(settle, 60); });
  }

  /* Search. Over http(s) the page uses search-index.json when it belongs to this content; opened from disk (where
     browsers refuse to fetch a file), or when that index is missing or older, it builds the same index right here. */

  var index = null, docs = null;

  function useIndex(built, from) {
    index = built;
    doc.documentElement.setAttribute('data-search-index', from);   // "file" or "built-in-page", for whoever tests this
  }
  function getIndex() {
    if (!index) useIndex(HelpSearch.buildIndex(content, data.source), 'built-in-page');
    return index;
  }
  function getDocs() {
    if (!docs) { docs = Object.create(null); HelpSearch.collect(content).forEach(function (one) { docs[one.id] = one; }); }
    return docs;
  }

  function marked(className, parts) {
    return el('span', { class: className }, parts.map(function (part) { return part.hit ? el('mark', { text: part.text }) : part.text; }));
  }

  function runSearch() {
    var query = input.value.trim(), found, all, count;
    clearButton.hidden = !input.value;
    searchKey.hidden = !!input.value;
    results.textContent = '';
    if (query.length < 2) {
      results.hidden = status.hidden = true;
      status.textContent = '';
      toc.hidden = false;
      return;
    }
    found = HelpSearch.search(getIndex(), query);
    all = getDocs();
    count = 0;
    found.hits.forEach(function (hit) {
      var one = all[hit.id];
      if (!one) return;
      count++;
      results.appendChild(el('a', { class: 'result', href: '#' + hit.id }, [
        el('span', { class: 'result-part', text: one.part + (one.updating ? ' · ' + ui.updating : '') }),
        marked('result-title', HelpSearch.snippet([one.title], found.terms, 400)),
        marked('result-text', HelpSearch.snippet(one.lines, found.terms))
      ]));
    });
    status.textContent = !count ? fill(ui.resultsNone, { q: query }) : found.partial ? fill(ui.resultsPartial, { n: count })
      : count === 1 ? ui.resultsOne : fill(ui.resultsMany, { n: count });
    results.hidden = status.hidden = false;
    toc.hidden = true;
    sidebar.scrollTop = 0;
  }

  function clearSearch() { input.value = ''; runSearch(); }

  function openSearch() {
    if (narrow.matches) setMenu(true);
    input.focus();
    input.select();
  }

  results.setAttribute('role', 'region');
  results.setAttribute('aria-label', ui.resultsTitle);
  input.addEventListener('input', runSearch);
  clearButton.addEventListener('click', function () { clearSearch(); input.focus(); });
  doc.getElementById('search-button').addEventListener('click', openSearch);
  doc.getElementById('search-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var first = results.querySelector('.result');
    if (first) first.click();                       // Enter goes to the best match
  });
  input.addEventListener('keydown', function (event) {
    var first = results.querySelector('.result');
    if (event.key === 'ArrowDown' && first) { event.preventDefault(); first.focus(); }
    else if (event.key === 'Escape' && input.value) { event.preventDefault(); event.stopPropagation(); clearSearch(); }
  });
  results.addEventListener('keydown', function (event) {
    var here = event.target.closest('.result');
    if (!here) return;
    if (event.key === 'ArrowDown' && here.nextElementSibling) { event.preventDefault(); here.nextElementSibling.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); (here.previousElementSibling || input).focus(); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); input.focus(); }
  });

  doc.addEventListener('keydown', function (event) {
    var where = event.target, typing = where && (/^(INPUT|TEXTAREA|SELECT)$/.test(where.tagName) || where.isContentEditable);
    if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); openSearch(); }
    else if (event.key === 'Escape' && menuOpen) { setMenu(false); menuButton.focus(); }
  });

  if (win.location.protocol !== 'file:' && win.fetch) {
    win.fetch('search-index.json').then(function (response) { return response.ok ? response.json() : null; }).then(function (file) {
      if (file && file.version === 2 && file.source === data.source && Array.isArray(file.entries)) {
        useIndex(file, 'file');
        if (input.value.trim().length > 1) runSearch();
      }
    }).catch(function () { /* the index is built in the page on first use instead */ });
  }
  if (input.value) runSearch();                     // a query the browser kept across a reload

  /* Printing: lazy pictures have to be there first. Only the view the print stylesheet shows is fetched. */

  function loadForPrint() {
    var waiting = [];
    printing = true;
    each('.shot', function (figure) {
      var img = figure.querySelector('.shot-pane--desktop img') || figure.querySelector('.shot-pane--phone img');
      if (!img) return;
      img.loading = 'eager';
      if (!img.complete) waiting.push(img);
    });
    return waiting;
  }
  win.addEventListener('beforeprint', loadForPrint);
  doc.getElementById('print-button').addEventListener('click', function () {
    var printed = false;
    function print() { if (!printed) { printed = true; win.print(); } }
    (function wait() {
      var waiting = loadForPrint(), left = waiting.length;
      if (!left) { print(); return; }
      function done() { if (--left <= 0) win.setTimeout(wait, 0); }   // look again: a picture that failed was drawn again
      waiting.forEach(function (img) { img.addEventListener('load', done); img.addEventListener('error', done); });
    })();
    win.setTimeout(print, 4000);                    // do not keep the reader waiting for a slow picture
  });

  /* A note for whoever maintains the manual (information, not an error). */
  (function () {
    var total = 0, missing = { desktop: 0, mobile: 0 };
    content.parts.forEach(function (part) {
      part.steps.forEach(function (step) {
        (step.shots || []).forEach(function (shot) {
          total++;
          if (!have.desktop[shot.file]) missing.desktop++;
          if (!have.mobile[shot.file]) missing.mobile++;
        });
      });
    });
    if ((missing.desktop || missing.mobile) && win.console && win.console.info) {
      win.console.info('Help manual: ' + missing.desktop + ' desktop and ' + missing.mobile + ' phone screenshots of ' + total +
        ' are not listed in help-data.js, so placeholders are shown. Add the WebP files, then run: node tools/build-search-index.mjs');
    }
  })();
})(typeof globalThis !== 'undefined' ? globalThis : this);
