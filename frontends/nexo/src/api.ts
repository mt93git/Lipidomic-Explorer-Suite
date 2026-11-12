import { requestQueue, type RequestOptions } from './prefetch';
import analysisFixture from './api/mock/analysis.json';
import { invalidateAnalysis } from './analysisGeneration';
import {mockViolinStatistics,mockViolinPolicy} from './mock/statistics';
import { validateState } from './state/validate';
import {validateNexo,assertNexoMember} from './state/nexo';
import { checkpointZip, readCheckpointZip } from './mock/archive';
import { mockCohortGet, mockCohortPut, mockCohortSaved, mockCohortOpened, mockCohortCounters } from './mock/cohort';
import { mockPaletteGet, mockPalettePut, mockPaletteSaved, mockPaletteOpened, mockPaletteCounters, mockPaletteOverride, mockPaletteTeamState, mockPaletteGroups } from './mock/palette';
import type { PaletteChange, PaletteState, SessionPalette } from './palette/sessionPalette';
import { schemaFor, sessionPaletteFamily, mockCounters, mockActionModals, mockComputedLabel, mockHeatStatus, MOCK_HEAT_RENDER_UNAVAILABLE, MOCK_STRUCTURAL_PLACEHOLDER, mockLayoutApply, mockLayoutDownload, mockAct } from './mock/schema';
import { checkUploadFile, parseLayoutJson, refusal } from './state/layoutUpload';
import { mockTimecourseUpdate, mockTimecourseGenerated, isLongitudinal } from './mock/timecourse';
import { clearRunNeedIfPressed, markNewCardRunNeed, runNeedKey, UNAVAILABLE_INPUTS } from './runNeeds';
import mockCatalog from './mock/catalog.json';
import { mockStructureFigure } from './mock/structure';
import { withTimePoints } from './catalog';
import { cardInstanceId } from './api/instance';
import { withSession, liveSession } from './api/session';
import { collab } from './collab/mode';
import type { IntentKind } from './collab/intents';
import { mockPng } from './mock/png';
import { confirmedMessage, unconfirmedMessage } from './groupComparison/fixture';
import { mockPcaScore, mockPcaScoreFigure } from './mock/pcaScore';
import { mockCompanionAsk } from './mock/companion';
import type { Catalog, CardResult, CardUpdate, CardRender, DatasetOpen, DatasetSession, DatasetSettings, Design, Inputs, Node, Session, PlotResult } from './api/types';
import { interpretDatasetResponse } from './api/datasetSession';
import { mockDatasetRecord, mockDatasetChoices, mockPreparedCounts, mockDatasetCounters } from './mock/dataset';
import { adminHeaders, forgetAdminToken, useAdminTokenFetch, AdminSignInRequired } from './api/adminToken';
import { mockAdminTokenFetch, mockAdminToken } from './mock/adminToken';
export { AdminSignInRequired, adminSignInUrl, knownAdminView, type AdminView } from './api/adminToken';
import { datasetStrings } from './ui/strings';
export type * from './api/types';
import { checkpointRecords, checkpointCanvas, checkpointNexo, putCheckpoint, removeCheckpoint } from './mock/checkpointStore';
import type { Checkpoint } from './api/types';
import session from './mock/session.json';
import pca from './mock/pca.json';
import violin from './mock/violin.json';
import dist from './mock/dist.json';
import comp from './mock/comp.json';
import heat from './mock/heat.json';
import mockExportPresets from './mock/exportPresets.json';
export const plots = { pca, violin, dist, comp, heat };
export type PlotId = keyof typeof plots;
export function inputsFor(s: Session): Record<string, unknown> {
  const inputs: Record<string, unknown> = { color_by: 'Group1', n_class: 7, top_n: 30, pca_transform: 'log2', pca_scale: 'uv', ...s.inputs };
  if (!inputs.violin_lipid && Array.isArray(s.lipids) && typeof s.lipids[0] === 'string') inputs.violin_lipid = s.lipids[0];
  return inputs;
}
// The R engine serves one request at a time (503 while busy), so requests are
// queued here and a 503 is retried while retaining the transport slot. Card renders,
// dashboard plots and the cohort read (shared, up to 1 + the session's render workers)
// may be in flight together; any other request runs alone once they have settled.
// The API's error: its message, plus status and error code (a lost session is 409 session_lost or 404 Unknown session).
// NEXO-P6 item 2: note = Team's validation message (validate(need()), the BQC sentence), shown as a quiet note.
const apiError = (status: number, value: {error?: unknown; note?: unknown}, message: string) => Object.assign(new Error(message), {status, code: typeof value.error === 'string' ? value.error : undefined, ...(value.note === true ? {note: true} : {})});
// The store per client (docs/integration/nexo-store-scope.md): the API refuses a checkpoint call without a valid Admin token.
function adminRefused(status: number, value: {error?: unknown}) {
  if (status !== 401 || value.error !== 'admin_auth_required') return;
  forgetAdminToken(); throw new AdminSignInRequired(datasetStrings.signedOutCheckpoints);
}
async function retryBusy(response: Response, started: number, attempt: number, signal?: AbortSignal): Promise<boolean> {
  if (response.status !== 503 || Date.now() - started >= 180000) return false;
  const raw = response.headers.get('Retry-After');
  const seconds = raw === null ? NaN : Number(raw);
  const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Math.min(500 * 2 ** attempt, 5000);
  const remaining = 180000 - (Date.now() - started);
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, Math.min(delay, remaining));
    const abort = () => { clearTimeout(timer); reject(signal!.reason); };
    signal?.addEventListener('abort', abort, {once:true});
  });
  return Date.now() - started < 180000;
}
async function send<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', signal?: AbortSignal, headers: Record<string, string> = {}): Promise<T> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const extra = Object.keys(headers).length ? {headers} : {};
    const response = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}${path}`, { method, signal, ...(body === undefined ? extra : {headers: {'Content-Type':'application/json', ...headers}, body:JSON.stringify(body)}) });
    if (await retryBusy(response, started, attempt, signal)) continue;
    // Collab mode (collab/render.ts): the answer carries R's engine revision, not enumerable (never saved or compared).
    const engine = collab() ? Number(response.headers.get('X-Nexo-Engine-Revision') ?? NaN) : NaN;
    const tagged = <V>(value: V): V => Number.isFinite(engine) && value && typeof value === 'object' ? Object.defineProperty(value, 'engineRevision', {value:engine}) : value;
    if (response.ok && response.headers.get('Content-Type')?.includes('image/png')) return tagged({blob:await response.blob(), revision:response.headers.get('X-Nexo-Revision')}) as T;
    const value = await response.json().catch(() => ({}));
    adminRefused(response.status, value);
    if (!response.ok) throw apiError(response.status, value, value.message ?? `Request failed (${response.status})`);
    return tagged(value) as T;
  }
}
function enqueue<T>(run: () => Promise<T>, options?: RequestOptions): Promise<T> {
  return requestQueue.add(run, options);
}
function request<T>(path: string, body?: unknown, method?: string, signal?: AbortSignal, options?: RequestOptions): Promise<T> { return enqueue(async () => { signal?.throwIfAborted(); return send<T>(path, body, method, signal, await adminHeaders(signal)); }, options); }
// Checkpoint routes: the same request with the signed-in Admin user's token (none signed out: the API decides).
function scoped<T>(path: string, body?: unknown, method?: string, signal?: AbortSignal, options?: RequestOptions): Promise<T> { return enqueue(async () => { signal?.throwIfAborted(); return send<T>(path, body, method, signal, await adminHeaders(signal)); }, options); }
const mock = import.meta.env.VITE_API_MOCK === '1';
const catalog = mockCatalog as Catalog;
if (mock) { catalog.outputs.forEach(e => { e.inputs = schemaFor(e.id).controls.filter(c => !c.computed).map(({options: _options, value: _value, ...control}) => control); }); Object.assign(window, { __nexoMock: mockCounters }); }
// Mock-only latency and send trace let the browser suite observe actual queue dispatch.
// requests: dispatched renders in order; asked: renders as they enter the queue (cold-open check).
// workers: render workers the mock session announces (as renderWorkers), so the browser suite can send renders together.
// timePoints (mock only, off by default): the synthetic checkpoint reports two or more time points once the design is confirmed.
// patchDelayMs (mock only): a card PATCH answers late, as on a busy server (undo/redo restore races).
// heatSignificance (mock only): Team's guard for the heatmap's Significant only; null follows the mock design (an
// independent design confirmed), true/false force it (e.g. a session whose preparation went stale).
const prefetchMock: {delayMs:number; patchDelayMs:number; workers:number; timePoints:boolean; heatSignificance:boolean|null; requests:{instance:string;priority:string;width:number;height:number}[]; asked:string[]} = {delayMs:0,patchDelayMs:0,workers:0,timePoints:false,heatSignificance:null,requests:[],asked:[]};
const mockHeatAllowed = (id: string) => prefetchMock.heatSignificance ?? (mockSession(id).design?.confirmed === true && mockSession(id).design?.allowed === true);
if(mock)Object.assign(window,{__nexoPrefetchMock:prefetchMock});
// evict(kind): as the API after an eviction (409 session_lost) or a restart (404 Unknown session.): every open mock
// session is dropped with its cards and answers so on its next route. failReopen: the next reopens fail. sessionCalls: attempts.
const sessionMock: {lost:Map<string,409|404>; failReopen:boolean; opens:number; calls:{route:string;id:string;attempt:number}[]} = {lost:new Map(), failReopen:false, opens:0, calls:[]};
if(mock)Object.assign(prefetchMock,{
  evict(kind:409|404=409){ for(const id of [...sessions.keys()]){ sessions.delete(id); sessionMock.lost.set(id,kind); for(const key of [...cards.keys()]) if(key.startsWith(id+'/')) cards.delete(key); } },
  failReopen(value=true){ sessionMock.failReopen=value; },
  sessionCalls: sessionMock.calls, session: sessionMock,
});
// Small fixes item 4 (mock only): saveOutage.status makes canvas validate and checkpoint save fail as during an API outage
// or restart: an HTTP status (500, 502, 503) or 0 for no answer at all (fetch's TypeError); null is the normal API.
// hits counts the refused attempts (the suite checks the backoff).
const outageMock: {status: number | null; hits: number} = {status: null, hits: 0};
if(mock)Object.assign(prefetchMock,{saveOutage: outageMock});
function mockOutage() {
  if (outageMock.status === null) return; outageMock.hits++;
  throw outageMock.status === 0 ? new TypeError('Failed to fetch') : Object.assign(new Error(`Request failed (${outageMock.status})`), {status: outageMock.status});
}
const sessions = new Map<string, Session>();
const cards = new Map<string, CardResult>();
// Module actions pressed per session card (mock of cards.R s$pressed): a new session's card has none.
const mockPressed = new Map<string, Set<string>>();
const mockPress = (key: string, actions: string[]) => { const set = mockPressed.get(key) ?? new Set<string>(); actions.forEach(a => set.add(a)); mockPressed.set(key, set); };
// Mock Group comparison cards whose reference group was confirmed (first render asks for confirmation).
const confirmedComparisons = new Set<string>();
const mockComparison = (id: string, instance: string) => structuredClone({...(confirmedComparisons.has(`${id}/${instance}`) ? confirmedMessage : unconfirmedMessage), id:instance});
function mockSession(id: string) { const value = sessions.get(id); if (!value) throw new Error('Unknown session'); return value; }
function mockCard(id: string, instance: string) { mockSession(id); const card = cards.get(`${id}/${instance}`); if (!card) throw new Error('Unknown card'); return card; }
const path = (id: string) => `/sessions/${encodeURIComponent(id)}`;
// A lost session (src/api/session.ts): every session route is sent with the live id and, when the API says the
// session is gone, waits for the app's recovery and is retried once. calls: mock-only trace of each attempt.
function mockGate(id: string) {
  const kind = sessionMock.lost.get(id); if (!kind) return;
  throw kind === 409 ? Object.assign(new Error('Session is no longer usable; reopen the checkpoint.'), {status:409, code:'session_lost'})
    : Object.assign(new Error('Unknown session.'), {status:404, code:'not_found'});
}
function sessionRoute<A extends unknown[], T>(route: string, fn: (id: string, ...args: A) => Promise<T>): (id: string, ...args: A) => Promise<T> {
  return (id, ...args) => withSession(id, (live, attempt) => {
    if (mock) { sessionMock.calls.push({route, id:live, attempt}); try { mockGate(live); } catch (error) { return Promise.reject(error); } }
    return fn(live, ...args);
  });
}
// Phase 3 (collab/intents.ts; plan "Phases 3–7 as cut"): with collaboration on, a science change is one intent to the
// sidecar, which calls R and writes the settled values into the document; the caller gets what the direct route would
// have answered from a read once the intent's result is in. The intents module (and yjs) loads only then.
let intentsModule: Promise<typeof import('./collab/intents')> | undefined;
async function viaIntent<T>(kind: IntentKind, on: {instance?: string; nodeId?: string}, payload: unknown, read: () => Promise<T>): Promise<T> {
  const intents = await (intentsModule ??= import('./collab/intents'));
  const nodeId = on.nodeId ?? (on.instance ? intents.nodeFor(on.instance) : undefined);
  await intents.sendIntent(kind, nodeId ? { nodeId } : {}, payload);
  return read();
}
/** Collab mode: removing cards parks them through the sidecar, which takes them out of the document. False flag off:
 *  the canvas removes them itself. */
export function parkCards(nodeIds: string[]): boolean {
  if (!collab()) return false;
  nodeIds.forEach(nodeId => { void viaIntent('parkCard', {nodeId}, {}, async () => undefined).catch(() => { /* refused: intents.ts toasts */ }); });
  return true;
}
/** Collab mode: Finish (with the snapshot) or Edit figure (null) is an intent; null flag off (the canvas writes it). */
export function figureIntent(nodeId: string, finished: Node['finished'] | null): Promise<void> | null {
  return collab() ? viaIntent(finished ? 'finish' : 'editFigure', {nodeId}, finished ? {finished} : {}, async () => undefined) : null;
}
/** A card as the session holds it now (GET /sessions/<id>: cards). */
const sessionCard = sessionRoute('sessionCard', (id: string, instance: string): Promise<CardResult> => mock ? enqueue(async () => structuredClone(mockCard(id, instance)))
  : request<{cards: CardResult[]}>(path(id)).then(({cards}) => { const card = cards.find(c => c.instanceId === instance); if (!card) throw new Error('Unknown card'); return card; }));
/** Analysis settings, the cohort and the session palette as this page last applied them (per session id the app holds), to put back after a reopen. */
const held = new Map<string, {analysis?: Inputs; cohort?: string[]; palette?: PaletteState}>();
const heldEdits = (id: string) => { const key = liveSession(id); let value = held.get(key); if (!value) held.set(key, value = {}); return value; };
/** Put back the analysis settings and cohort the lost session had on the reopened one. */
export async function replayHeldEdits(lostId: string, nextId: string) {
  const edits = held.get(lostId); if (!edits) return;
  if (edits.analysis && Object.keys(edits.analysis).length) await updateAnalysis(nextId, edits.analysis);
  if (edits.cohort) await setCohort(nextId, edits.cohort);
  // Pilot F1: the session palette Team keeps in the session (and saves in the checkpoint) as this page last set it.
  if (edits.palette) await updatePalette(nextId, {restore: edits.palette});
  held.set(nextId, structuredClone(edits));
}
export { SessionLostError, isSessionLost, liveSession, setSessionRecovery, reopenLostSession } from './api/session';
// The catalog is fixed for a server build: ask once (canvas and library both need it at open), a copy per caller.
let catalogRequest: Promise<Catalog> | undefined;
export const getCatalog = (): Promise<Catalog> => mock ? enqueue(async () => structuredClone(catalog))
 : (catalogRequest ??= request<Catalog>('/catalog').catch(error => { catalogRequest = undefined; throw error; })).then(value => structuredClone(value));
export const getCheckpoints = () => listCheckpoints();
// Card renders may run on the API's render workers beside the main process (at most 4 used here).
const useRenderWorkers = (value: Session) => { requestQueue.capacity = 1 + Math.max(0, Math.min(4, value.renderWorkers ?? 0)); return value; };
export const openSession = (checkpointId: string, signal?: AbortSignal): Promise<Session> => mock ? enqueue(async () => {
  signal?.throwIfAborted();
  sessionMock.opens++;
  if (sessionMock.failReopen) throw new Error('The analysis could not be reopened (mock).');
  if (!checkpointRecords().some(c => c.id === checkpointId)) throw new Error('Unknown checkpoint');
  const value = structuredClone(session) as Session;
  value.canvas = checkpointCanvas(checkpointId) ?? value.canvas; value.nexo=checkpointNexo(checkpointId)??null;
  // Mock only: localStorage nexo.mock.nearLimit=1 opens a checkpoint whose project records are near Team's limit.
  if (globalThis.localStorage?.getItem('nexo.mock.nearLimit') === '1') value.near_limit = true;
  value.sessionId = crypto.randomUUID(); value.design = {allowed:false, unit:null, type:null, confirmed:false}; value.deState = null;
  sessions.set(value.sessionId, value); mockCohortOpened(checkpointId, value.sessionId); mockPaletteOpened(checkpointId, value.sessionId);
  value.canvas.nodes.forEach(node=>{if(!node.instance)return;const instanceId=node.instance.id ?? node.instance.instanceId;if(!instanceId)return;
   const entry=catalog.outputs.find(e=>e.id===node.instance!.source);if(!entry)return;
   cards.set(`${value.sessionId}/${instanceId}`,{instanceId,nodeId:node.id,source:entry.id,family:entry.family,render:entry.render,allowedInputs:entry.allowedInputs,inputs:node.instance.inputs ?? {},settled:true,error:null});
  });if(prefetchMock.workers)value.renderWorkers=prefetchMock.workers;return useRenderWorkers(value);
}) : scoped<Session>('/sessions', {checkpointId}, undefined, signal).then(value => { value.design = withTimePoints(value.design, value.deState); return useRenderWorkers(value); });
// A session the server opened (from a checkpoint or an Admin dataset): the same time-point and render-worker bookkeeping.
function opened<T extends Session>(value: T): T { value.design = withTimePoints(value.design, value.deState); useRenderWorkers(value); return value; }
// POST /datasets/sessions for a released Admin dataset (docs/integration/admin-nexo-open.md). Its 503 is either the Admin
// store (admin_datasets_unavailable: said at once) or the busy engine (retried as send does).
// The signed-in Admin user's token goes along in the dedicated header (admin-identity.md); a 401 from Admin or from here asks to
// sign in to Admin once, without retrying, and forgets the token.
async function sendDataset(body: unknown, signal?: AbortSignal): Promise<DatasetOpen> {
  const headers: Record<string, string> = {'Content-Type':'application/json', ...await adminHeaders(signal, true)};
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}/datasets/sessions`, { method: 'POST', signal, headers, body: JSON.stringify(body) });
    const value = await response.json().catch(() => ({})) as { error?: string };
    if (response.status === 401) forgetAdminToken();
    if (value.error !== 'admin_datasets_unavailable' && await retryBusy(response, started, attempt, signal)) continue;
    return interpretDatasetResponse(response.status, value);
  }
}
// Mock mode: Admin's token route answers from src/mock/adminToken.ts; the suite reads its request count and the last admin token header.
if (mock) { useAdminTokenFetch(mockAdminTokenFetch); Object.assign(window, { __nexoDatasetMock: Object.assign(mockDatasetCounters, { admin: mockAdminToken }) }); }
/** Without settings: the choices Team needs (422). With them: the prepared session, opened as a checkpoint session is. */
export const openDatasetSession = (adminDatasetId: string, settings?: DatasetSettings, signal?: AbortSignal): Promise<DatasetOpen> => mock ? enqueue(async () => {
  signal?.throwIfAborted();
  const headers = await adminHeaders(signal, true); mockDatasetCounters.authorization = headers['X-Nexo-Admin-Token'] ?? null;
  const dataset = mockDatasetRecord(adminDatasetId); if (!dataset) throw new Error(datasetStrings.notFound);
  const choices = mockDatasetChoices(dataset, settings); if (choices) return { status: 'choices', choices };
  const value = structuredClone(session) as unknown as DatasetSession;
  value.canvas = { version: '1', libraryHidden: false, nodes: [] }; value.nexo = null;
  value.sessionId = crypto.randomUUID(); value.design = { allowed: false, unit: null, type: null, confirmed: false }; value.deState = null;
  Object.assign(value, mockPreparedCounts(dataset, settings!)); value.checkpointSha256 = dataset.sha256;
  value.dataset = { sha256: dataset.sha256, format: 1, settings: structuredClone(settings!), adminDatasetId, orderCode: dataset.orderCode, version: dataset.version };
  sessions.set(value.sessionId, value); mockDatasetCounters.opened++; mockDatasetCounters.last = structuredClone(settings!);
  if (prefetchMock.workers) value.renderWorkers = prefetchMock.workers;
  useRenderWorkers(value); return { status: 'ready', session: value };
}) : enqueue(() => { signal?.throwIfAborted(); return sendDataset(settings ? { adminDatasetId, settings } : { adminDatasetId }, signal); })
  .then((result): DatasetOpen => result.status === 'ready' ? { status: 'ready', session: opened(result.session) } : result);
// NEXO-P6 item 3: the design gates Team's statistics (FLA significance brackets, p-values): every card redraws, as on an analysis change.
export const confirmDesign = (id: string, unit: string, type: string): Promise<Design> => (collab()
  ? viaIntent('design', {}, {unit, type}, () => sessionRoute('joinDesign', (id: string) => mock ? enqueue(async () => structuredClone(mockSession(id).design!)) : request<Session>(`${path(id)}/join`).then(value => value.design!))(id))
  : confirmDesignRoute(id, unit, type)).then(design => { invalidateAnalysis(id); return design; });
const confirmDesignRoute = sessionRoute('confirmDesign', (id: string, unit: string, type: string): Promise<Design> => mock ? enqueue(async () => {
  const design: Design = {allowed:type === 'independent', unit, type, confirmed:true, ...(prefetchMock.timePoints ? {timePointsReady:true} : {})}; mockSession(id).design = design; return design;
}) : request<Design & {deState?: unknown}>(`${path(id)}/design`, {unit, type, confirm:true}).then(value => withTimePoints(value, value.deState)));
// As the server: a new card carries every input of its schema (Team seeds them), not only the catalog defaults.
const schemaDefaults = (source: string): Inputs => Object.fromEntries(schemaFor(source).controls.filter(c => c.default !== undefined && !c.computed).map(c => [c.id, c.default as Inputs[string]]));
const newInstanceId = () => `tcinstance_${Array.from(crypto.getRandomValues(new Uint8Array(6)), n => n.toString(16).padStart(2,'0')).join('')}`;
const createCardRoute = sessionRoute('createCard', (id: string, source: string, inputs: Inputs, instanceId: string = newInstanceId(), signal?: AbortSignal): Promise<CardResult> => mock ? enqueue(async () => {
  signal?.throwIfAborted();
  mockSession(id); const entry = catalog.outputs.find(e => e.id === source); if (!entry) throw new Error('Unknown source');
  const card: CardResult = {instanceId, nodeId:`${instanceId}-${entry.output}`, source, family:entry.family, render:entry.render, allowedInputs:entry.allowedInputs, inputs:{...schemaDefaults(source),...entry.defaults,...inputs}, settled:true, error:null};
  if (entry.heightInput && typeof card.inputs[entry.heightInput] === 'number') card.plotHeight = card.inputs[entry.heightInput] as number;
  cards.set(`${id}/${instanceId}`, card); return structuredClone(card);
}) : request(`${path(id)}/cards`, {instanceId, source, inputs}, undefined, signal));
/** Small fixes item 3: the create answer sets the run-need gate (runNeeds.ts markNewCardRunNeed) before the card's first render.
 *  Collab mode: `placed` is the node the person placed (id `<instanceId>-<output>`, as R names it); the sidecar creates the
 *  card and writes the node into the document itself (commits.mjs createCard), so the caller does not add it. */
export const createCard = (id: string, source: string, inputs: Inputs, instanceId: string = newInstanceId(), signal?: AbortSignal, placed?: Node): Promise<CardResult> => (collab()
  ? (placed ? viaIntent('createCard', {nodeId: placed.id}, {node: teamNode(placed, {id: instanceId, source, inputs})}, () => sessionCard(id, instanceId))
    : Promise.reject(new Error('A shared board places the card it creates.')))
  : createCardRoute(id, source, inputs, instanceId, signal)).then(card => { markNewCardRunNeed(runNeedKey(id, card.instanceId), card.nodeId); return card; });
// The node as the document holds it (collab/schema.ts nodeMap), the keys the sidecar writes.
const teamNode = ({kind, id, x, y, width, height, visual, color, label}: Node, instance: {id: string; source: string; inputs: Inputs}) =>
  ({kind, id, x, y, width, height, visual, ...(color !== undefined ? {color} : {}), label, instance});
export const updateCard = (id: string, instance: string, inputs: Inputs, actions: Inputs | string[] = []): Promise<CardUpdate> => collab()
  ? (clearRunNeedIfPressed(runNeedKey(id, instance), actions), viaIntent(Object.keys(actions).length ? 'action' : 'inputs', {instance}, {instanceId: instance, inputs, actions},
    () => sessionCard(id, instance).then(({settled, inputs, plotHeight}) => ({settled, inputs, ...(plotHeight !== undefined ? {plotHeight} : {})}))))
  : updateCardRoute(id, instance, inputs, actions);
const updateCardRoute = sessionRoute('updateCard', (id: string, instance: string, inputs: Inputs, actions: Inputs | string[] = []): Promise<CardUpdate> => (clearRunNeedIfPressed(runNeedKey(id, instance), actions), mock ? enqueue(async () => {
  let card = cards.get(id + '/' + instance);
  if (!card) {
    // As the API (cards.R api_card_get): a node with no instance answers only to its server id (tcinstance_v0_<output>, tcinstance_fixed_<id>), never to its node id.
    const node = mockSession(id).canvas.nodes.find(n => cardInstanceId(n) === instance);
    if (!node) throw new Error('Unknown card');
    card = {instanceId:instance,nodeId:node.id,source:node.id,family:'results_dashboard',render:'plotly',allowedInputs:[],inputs:{...mockSession(id).inputs},settled:true,error:null};
    cards.set(id + '/' + instance, card);
  }
  // Pilot F1, as the API (cards.R): a QC copy's per-group pickers never reach its plot; old values are dropped.
  if (card.family === 'qc_pca_tab') inputs = Object.fromEntries(Object.entries(inputs).filter(([k]) => !/^custom(Col|Shape)_/.test(k))) as Inputs;
  mockCounters.cardPatches.push({instance, body: structuredClone({inputs, actions})});
  if (Array.isArray(actions)) mockPress(id + '/' + instance, actions.filter(a => !/download/i.test(a)));
  mockTimecourseUpdate(card.source, inputs, actions, instance);
  card.inputs = {...card.inputs,...inputs};
  // As the server after a module button: Team's renderUI may build inputs the API then seeds (missing-controls-a).
  card.inputs = {...card.inputs,...mockAct(card.source, instance, Array.isArray(actions) ? actions : [], card.inputs)};
  const answer = structuredClone(card.inputs);
  if (prefetchMock.patchDelayMs) await new Promise(r => setTimeout(r, prefetchMock.patchDelayMs));
  const modal = (Array.isArray(actions) ? actions : []).map(a => mockActionModals[a]).find(Boolean);
  const heightInput = catalog.outputs.find(e => e.id === card!.source)?.heightInput, plotHeight = heightInput ? Number(answer[heightInput]) : NaN;
  return {settled:true, inputs:answer, ...(Number.isFinite(plotHeight) ? {plotHeight} : {}), ...(modal ? {modal:structuredClone(modal)} : {})};
}) : request(`${path(id)}/cards/${encodeURIComponent(instance)}`, {inputs, actions}, 'PATCH')));
/** Chart audit b07 F3: the API presses, in order, the recorded module actions this card has not had (cards.R api_card_replay). */
export interface ReplayResult { replayed: string[]; failed: string[]; pressed: string[]; settled: boolean }
export const replayActions = (id: string, instance: string, actions: string[]): Promise<ReplayResult> => replayRoute(id, instance, actions).then(result => (clearRunNeedIfPressed(runNeedKey(id, instance), result.pressed), result));
const replayRoute = sessionRoute('replayActions', (id: string, instance: string, actions: string[]): Promise<ReplayResult> => mock ? enqueue(async () => {
  const card = mockCard(id, instance), key = `${id}/${instance}`, pressed = mockPressed.get(key) ?? new Set<string>(), offered = schemaFor(card.source).actions;
  mockCounters.replays.push({instance, actions: [...actions]});
  const todo = actions.filter(a => !pressed.has(a)), failed = todo.filter(a => mockCounters.replayFault || !offered.includes(a)), replayed = todo.filter(a => !failed.includes(a));
  mockPress(key, replayed);
  return {replayed, failed, pressed: [...(mockPressed.get(key) ?? [])], settled: true};
}) : request<ReplayResult>(`${path(id)}/cards/${encodeURIComponent(instance)}/replay`, {actions}));
/** Chart audit b12: a Plotly click on a cell plot, forwarded to Team's observer (cards.R api_card_event, plotlyClick.ts). */
export const sendCardEvent = sessionRoute('sendCardEvent', (id: string, instance: string, body: {event: 'plotly_click'; source: string; points: import('./plotlyClick').ClickPoint[]}): Promise<import('./plotlyClick').CardEventReply> => mock ? enqueue(async () => {
  const card = mockCard(id, instance), entry = catalog.outputs.find(e => e.id === card.source);
  (mockCounters.cardEvents ??= []).push({instance, body: structuredClone(body)});
  if (body.event !== 'plotly_click' || !entry?.clickSource) throw refusal('This plot takes no click events.');
  if (body.source !== entry.clickSource) throw refusal('Unknown event source for this plot.');
  // As Team's observers (plot_instances.R): a known class selects cell_class; a shown measurement selects cell_sample.
  const hit = body.points[0], next = {...card.inputs};
  if (entry.clickSource === 'cell_class_profile' && typeof hit?.y === 'string' && MOCK_CELL_CLASSES.includes(hit.y)) next.cell_class = hit.y;
  if (entry.clickSource === 'cell_comparison_points' && typeof hit?.customdata === 'string' && MOCK_CELL_SAMPLES.includes(hit.customdata)) next.cell_sample = hit.customdata;
  const changed = Object.keys(next).filter(k => JSON.stringify(next[k]) !== JSON.stringify(card.inputs[k]));
  card.inputs = next;
  return {settled: true, inputs: structuredClone(next), changed};
}) : request(`${path(id)}/cards/${encodeURIComponent(instance)}/events`, body));
const MOCK_CELL_CLASSES = ['PC', 'PE', 'TG'], MOCK_CELL_SAMPLES = ['S01', 'S02', 'S03', 'S04'];
/** The mock's cell plots, drawn with Team's private event source so a click can be forwarded (b12). */
function mockClickFigure(instance: string, entry: import('./api/types').CatalogEntry, inputs: Inputs) {
  const source = `${instance}-${entry.clickSource}`;
  if (entry.clickSource === 'cell_class_profile') return {data:[{type:'bar', orientation:'h', x:[3, 2, 1], y:[...MOCK_CELL_CLASSES], name:'Reference'}], layout:{title:{text:`${entry.label} · class ${String(inputs.cell_class ?? '')}`}}, source};
  return {data:[{type:'scatter', mode:'markers', x:['Reference', 'Reference', 'Comparison', 'Comparison'], y:[1, 2, 3, 4], customdata:[...MOCK_CELL_SAMPLES], marker:{size:14}}], layout:{title:{text:`${entry.label} · measurement ${String(inputs.cell_sample ?? '')}`}}, source};
}
// b11 F3: a configuration file for the card's module (the pathway "Upload Layout JSON (.json):"), as export.R api_card_upload.
export const uploadCardFile = sessionRoute('uploadCardFile', (id: string, instance: string, input: string, file: {name: string; content: string}): Promise<import('./api/types').CardUpload> => mock ? enqueue(async () => {
  const card = mockCard(id, instance);
  if (!schemaFor(card.source).uploads?.some(u => u.id === input)) throw refusal('This plot has no such file input.');
  const refused = checkUploadFile(file.name, new TextEncoder().encode(file.content).length); if (refused) throw refusal(refused);
  const read = parseLayoutJson(file.content); if ('error' in read) throw refusal(read.error);
  mockCounters.uploads.push({instance, input, name:file.name});
  card.inputs = mockLayoutApply(card.inputs, read.value);
  return {settled:true, inputs:structuredClone(card.inputs), file:{name:file.name, size:file.content.length}};
}) : request(`${path(id)}/cards/${encodeURIComponent(instance)}/uploads/${encodeURIComponent(input)}`, file));
export const deleteCard = sessionRoute('deleteCard', (id: string, instance: string): Promise<void> => mock ? enqueue(async () => { mockCard(id,instance); cards.delete(`${id}/${instance}`); }) : request(`${path(id)}/cards/${encodeURIComponent(instance)}`, undefined, 'DELETE'));
/** Collab mode: a render older than the board's engine revision is discarded and asked again (collab/render.ts). */
export const renderCard: typeof renderCardRoute = (...args) => collab() ? import('./collab/render').then(m => m.currentRender(() => renderCardRoute(...args))) : renderCardRoute(...args);
const renderCardRoute = sessionRoute('renderCard', (id: string, instance: string, width: number, height: number, format: string, options?: RequestOptions, dpr: 1 | 2 = 1): Promise<CardRender> => mock ? (prefetchMock.asked.push(instance), enqueue(async () => {
  mockCounters.renders++;
  prefetchMock.requests.push({instance,priority:options?.priority?.()??'HIGH',width,height});
  if(prefetchMock.delayMs)await new Promise(r=>setTimeout(r,prefetchMock.delayMs));
  const card = mockCard(id,instance), entry = catalog.outputs.find(e => e.id === card.source)!;
  // As the server (frontends/nexo-api/cards.R): a card renders natively; "json" means its native JSON.
  if (format !== 'auto' && format !== 'json' && format !== card.render) throw new Error(`This card supports native ${card.render} rendering; requested ${format}`);
  // Team's BQC views with fewer than 2 BQC samples: the API answers Team's sentence (422, cards.R api_bqc_placeholder).
  const bqc = MOCK_BQC_PLACEHOLDERS[card.source]; if (bqc && mockBqcPlaceholder(card.inputs)) throw Object.assign(new Error(bqc), {status:422, note:true});
  // Team's heatmap with Significant only while the inference guard says no answers 422 with Team's message.
  if (card.source === 'results_dashboard-plot_heat' && card.inputs.heat_significance === 'significant' && !mockHeatAllowed(id)) throw new Error(MOCK_HEAT_RENDER_UNAVAILABLE);
  if (isLongitudinal(card.source) && !mockTimecourseGenerated(instance)) { mockCounters.refusals = (mockCounters.refusals ?? 0) + 1; throw new Error(UNAVAILABLE_INPUTS); }
  if (/VectorPlot$/.test(card.source)) throw new Error('Editable vector view unavailable: smart repelled labels are preserved only in the original view; disable smart labels to edit this view.');
  // NEXO-P2: Team draws the Structure figures as Plotly charts; Remodeling shifts shows Team's hint until its analysis runs.
  if (/^structural_(grid_)?tab-/.test(card.source)) { const shown = card.source === 'structural_tab-summaryPlot' && !mockPressed.get(`${id}/${instance}`)?.has('runAnalysis') ? {label:MOCK_STRUCTURAL_PLACEHOLDER} : mockComputedLabel(card.source, entry.label, card.inputs, instance); mockCounters.labels[instance] = shown.label; return {render:card.render, figure:mockStructureFigure(card.source, shown.label), provenance:{mock:true}}; }
  if (card.render === 'png') { const shown = mockComputedLabel(card.source, entry.label, card.inputs, instance, sessionPaletteFamily(card.source) ? mockPaletteOverride(id, 'Control') : undefined); mockCounters.labels[instance] = shown.label; (mockCounters.pngRenders ??= []).push({instance,width,height,dpr}); return {blob:await mockPng(shown.label,width,height,shown.fill,dpr), revision:'1'}; }
  if (/3dPlot$/.test(card.source)) return {render:card.render, figure:mockScene3d(entry.label), provenance:{mock:true}};
  if (card.source === 'results_dashboard-plot_pcascore') return {render:card.render, figure:mockPcaScoreFigure(card.inputs), provenance:{mock:true}};
  if (entry.clickSource) return {render:card.render, figure:mockClickFigure(instance, entry, card.inputs), provenance:{mock:true}};
  const dashboard = card.source.match(/^results_dashboard-plot_(pca|violin|dist|comp|heat)$/)?.[1] as PlotId | undefined;
  return {render:card.render, figure: card.render === 'visnetwork' ? {nodes:[{id:1,label:'Lipid'},{id:2,label:'Pathway'}],edges:[{from:1,to:2}]} : card.render === 'html' ? mockComparison(id,instance) : (dashboard ? mockSessionColours(id, structuredClone(plots[dashboard])) : {data:[{type:'scatter',x:[1,2,3],y:[2,1,3]}],layout:{title:(mockCounters.labels[instance] = mockComputedLabel(card.source, entry.label, card.inputs).label)}}), provenance:{mock:true}};
}, {...options, shared:true})) : request(`${path(id)}/cards/${encodeURIComponent(instance)}/render`, {width,height,format,...(dpr !== 1 ? {dpr} : {})}, undefined, undefined, {...options, shared:true}));
export const getPlot = sessionRoute('getPlot', (id: string, plot: PlotId, inputs: Inputs, width: number, options?: RequestOptions): Promise<PlotResult> => mock ? enqueue(async () => (mockCounters.renders++, {figure:mockSessionColours(id, structuredClone(plots[plot])),provenance:{mock:true}}), {...options, shared:true}) : request(`${path(id)}/plots/results_dashboard/${plot}`, {inputs,width}, undefined, undefined, {...options, shared:true}));

export const getCardSchema = sessionRoute('getCardSchema', (id: string, instance: string): Promise<import('./api/types').CardSchema> => mock ? enqueue(async () => {
  const card = cards.get(id + '/' + instance);
  const node = mockSession(id).canvas.nodes.find(n => cardInstanceId(n) === instance || n.instance?.instanceId === instance);
  if (!card && !node) throw new Error('Unknown card');
  const values = card?.inputs ?? node?.instance?.inputs ?? mockSession(id).inputs;
  const schema = schemaFor(card?.source ?? node!.instance?.source ?? node!.id, instance, values);
  schema.controls.forEach(c => { c.value = values[c.id] ?? c.default; });
  // As the real API (schema.R api_control_status): Team's note for Significant only, from the mock design state.
  schema.controls.forEach(c => { if (c.id === 'heat_significance') c.status = mockHeatStatus(mockHeatAllowed(id), c.value); });
  return schema;
}) : request(path(id) + '/cards/' + encodeURIComponent(instance) + '/schema'));

async function checkpointRequest<T>(path:string,body:unknown):Promise<T>{
 return enqueue(async()=>{const auth=await adminHeaders();const response=await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify(body)});
 const value=await response.json().catch(()=>({}));adminRefused(response.status,value);if(!response.ok)throw apiError(response.status,value,response.status===503 ? 'Server busy: '+(value.message ?? '') : value.message ?? `Request failed (${response.status})`);return value as T;});
}
const acknowledgements = new Map<string, {token:string; state:unknown}>();
// The mock asks Admin's token as the real call does, so a mock client member (src/mock/adminToken.ts) is known after a list.
export const listCheckpoints = (options?: RequestOptions): Promise<Checkpoint[]> => mock ? enqueue(async()=>(await adminHeaders(),structuredClone(checkpointRecords())), options) : scoped('/checkpoints', undefined, undefined, undefined, options);
export const validateCanvas = sessionRoute('validateCanvas', (id:string, token:string, state:unknown): Promise<{ok:boolean;message?:string;state:unknown}> => mock ? enqueue(async()=>{
 mockOutage(); mockSession(id); if(!/^[A-Za-z0-9_.:-]+$/.test(token))throw Error('Invalid token');
 const checked=validateState(state);if(!checked.ok)return {...checked,state:null};
 acknowledgements.set(id,{token,state:structuredClone(state)});return {ok:true,state:structuredClone(state)};
}) : checkpointRequest(`${path(id)}/canvas/validate`,{token,state}));
export const saveCheckpoint = sessionRoute('saveCheckpoint', (id:string,label:string,canvas:{token:string;state:unknown},nexo?:import('./state/nexo').Nexo): Promise<Checkpoint> => mock ? enqueue(async()=>{
 mockOutage(); if(nexo!==undefined)assertNexoMember(nexo);
 const ack=acknowledgements.get(id);if(!ack||ack.token!==canvas.token||JSON.stringify(ack.state)!==JSON.stringify(canvas.state))throw Error('Canvas validation did not ack (409)');
 acknowledgements.delete(id); await new Promise(r=>setTimeout(r,150));if(mockCounters.saveFault)throw Error(mockCounters.saveFault);return putCheckpoint(label,canvas.state,nexo).then(record=>(mockCohortSaved(id,record.id),mockPaletteSaved(id,record.id),record));
}) : checkpointRequest(`${path(id)}/checkpoints`,{label,canvas,nexo}));
export const uploadCheckpoint = async (file:File,label:string): Promise<Checkpoint> => {
 if(mock){const state=await readCheckpointZip(file);const checked=validateState(state);if(!checked.ok)throw Error(checked.message);return putCheckpoint(label,state,validateNexo(await readCheckpointZip(file,'nexo-canvas-v1.json')));}
 const form=new FormData();form.append('file',file);form.append('label',label);
 return enqueue(async()=>{const headers=await adminHeaders();const response=await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}/checkpoints`,{method:'POST',body:form,...(headers['X-Nexo-Admin-Token']?{headers}:{})});const value=await response.json().catch(()=>({}));adminRefused(response.status,value);if(!response.ok)throw Error(value.message ?? 'Upload failed');return value;});
};
/** A link for the checkpoint ZIP. With an Admin token the ZIP is fetched with it (a link cannot carry the header) and
 *  handed over as a blob: link (revoke it once clicked); without one, the plain route link as before. */
export async function checkpointDownload(id:string):Promise<string> {
 if(mock)return URL.createObjectURL(checkpointZip(checkpointCanvas(id) ?? session.canvas,checkpointRecords().find(c=>c.id===id)?.name,checkpointNexo(id),mockPaletteTeamState(id)));
 const url=`${import.meta.env.VITE_API_BASE ?? '/api/v1'}/checkpoints/${encodeURIComponent(id)}/download`,headers=await adminHeaders();
 if(!headers['X-Nexo-Admin-Token'])return url;
 return enqueue(async()=>{const started=Date.now();for(let attempt=0;;attempt++){
  const response=await fetch(url,{headers});
  if(await retryBusy(response,started,attempt))continue;
  if(response.ok)return URL.createObjectURL(await response.blob());
  const value=await response.json().catch(()=>({}));adminRefused(response.status,value);throw apiError(response.status,value,value.message ?? `Download failed (${response.status})`);
 }});
}
export const deleteCheckpoint = (id:string):Promise<void> => mock ? enqueue(async()=>{
 const record=checkpointRecords().find(c=>c.id===id);if(record?.source!=='store')throw Error('Folder checkpoints cannot be deleted');
 removeCheckpoint(id);
}) : scoped(`/checkpoints/${encodeURIComponent(id)}`,undefined,'DELETE');

// The mock's statistics data fingerprint follows the violin's lipid, as the server's follows the drawn data.
function mockDataFingerprint(id:string, instance:string):string {
 const legacy=instance.startsWith('tcinstance_v0_')?`results_dashboard-plot_${instance.slice(14)}`:instance;
 const inputs=(cards.get(`${id}/${legacy}`)??cards.get(`${id}/${instance}`))?.inputs;
 return `mock-data:${String(inputs?.violin_lipid??'PC(16:0/18:1)')}`;
}
// As the server (frontends/nexo-api/statistics.R): only a violin card the session knows, or the dashboard violin's v0 instance.
function mockViolinCard(id:string, instance:string) { mockSession(id); if (instance === 'tcinstance_v0_violin') return; if (cards.get(`${id}/${instance}`)?.source !== 'results_dashboard-plot_violin') throw new Error('Statistics are available for violin cards only'); }
/** Violin apply is an intent; describe, check and verify are reads (plan 2.2). The applied result is Team's verify of the
 *  same settings on the current data (statistics.R: apply and verify compute alike; apply only marks the session dirty). */
export const violinStatistics = (id:string, instance:string, body:import('./api/types').ViolinRequest):Promise<import('./api/types').ViolinReply> => collab() && body.mode === 'apply'
  ? viaIntent('applyViolin', {instance}, {instanceId: instance, settings: body.settings}, async () => {
    const {dataFingerprint} = await violinRoute(id, instance, {mode:'describe'});
    return {...await violinRoute(id, instance, {mode:'verify', settings: body.settings, dataFingerprint}), mode:'apply'};
  })
  : violinRoute(id, instance, body);
const violinRoute = sessionRoute('violinStatistics', (id:string, instance:string, body:import('./api/types').ViolinRequest):Promise<import('./api/types').ViolinReply> => mock ? enqueue(()=>(mockViolinCard(id,instance),mockViolinStatistics(instance,body,mockDataFingerprint(id,instance)))) : request(`${path(id)}/cards/${encodeURIComponent(instance)}/statistics/violin`,body));
export const violinPolicy = sessionRoute('violinPolicy', (id:string):Promise<import('./api/types').ViolinPolicy> => mock ? enqueue(async()=>({...mockViolinPolicy})) : request(`${path(id)}/statistics/violin/policy`));
/** NEXO-P5: Team's PCA score analysis of a dashboard PCA card (GET .../pca-score). */
export const pcaScore = sessionRoute('pcaScore', (id:string,instance:string):Promise<import('./api/types').PcaScoreReply> => mock ? enqueue(async()=>{const card=cards.get(`${id}/${instance}`),node=card?undefined:mockSession(id).canvas.nodes.find(n=>cardInstanceId(n)===instance);if(!card&&!node)throw new Error('Unknown card');return mockPcaScore(card?.source??node!.instance?.source??node!.id,card?.inputs??node?.instance?.inputs??mockSession(id).inputs);}) : request(`${path(id)}/cards/${encodeURIComponent(instance)}/pca-score`));
export const groupComparison = sessionRoute('groupComparison', (id:string,instance:string):Promise<import('./api/types').GroupComparisonReply> => mock ? enqueue(async()=>(mockCard(id,instance),mockComparison(id,instance))) : request(`${path(id)}/cards/${encodeURIComponent(instance)}/group-comparison`));
export const confirmGroupComparison = (id:string, instance:string, token:string):Promise<import('./api/types').GroupComparisonReply> => collab()
  ? viaIntent('confirmBaseline', {instance}, {instanceId: instance, confirmationToken: token}, () => groupComparison(id, instance))
  : confirmGroupComparisonRoute(id, instance, token);
const confirmGroupComparisonRoute = sessionRoute('confirmGroupComparison', (id:string,instance:string,token:string):Promise<import('./api/types').GroupComparisonReply> => mock ? enqueue(async()=>{mockCard(id,instance);if(token!=='mock-reference')throw new Error('Unknown confirmation token');confirmedComparisons.add(`${id}/${instance}`);return mockComparison(id,instance);}) : request(`${path(id)}/cards/${encodeURIComponent(instance)}/group-comparison/confirm`,{confirmationToken:token}));

// Export: files come back as attachments; errors keep the server's message (400 bad field, 422 Team's reason).
async function sendFile(path:string, fallback:string, body?:unknown):Promise<import('./api/types').FileDownload> {
 const started = Date.now();
 for (let attempt = 0; ; attempt++) {
  const headers = await adminHeaders();
  const response = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}${path}`, body === undefined ? {headers} : {method:'POST', headers:{'Content-Type':'application/json', ...headers}, body:JSON.stringify(body)});
  if (await retryBusy(response, started, attempt)) continue;
  // A module handler that fails inside Team's code reaches us as a bare 500 (no message): say what failed and what to check.
  if (!response.ok) { const value = await response.json().catch(() => ({})); throw apiError(response.status, value, value.message ?? (response.status >= 500
    ? `Team's module could not make this file (server error ${response.status}). Check that the plot shows data, then try again.` : `Request failed (${response.status})`)); }
  const filename = /filename="?([^";]+)"?/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? fallback;
  return {blob:await response.blob(), filename};
 }
}
// The mock mirrors the server's field checks; tests inject a rejected field through __nexoExportMock.fault.
// downloadFault: the next module download answers 422 with this body, as the API does when Team's module fails to build it.
const exportMock: {last:unknown; csv:string|null; download:{instance:string;id:string}|null; fault:Record<string,unknown>|null; downloadFault:{error:string;message:string}|null} = {last:null, csv:null, download:null, fault:null, downloadFault:null};
if (mock) Object.assign(window, {__nexoExportMock: exportMock});
function mockExportCheck(body:Record<string,unknown>) {
 const presets = mockExportPresets as import('./api/types').ExportPresets, bad = (message:string) => { throw new Error(message); };
 const number = (name:string, lo:number, hi:number) => { const value = Number(body[name]); if (typeof body[name] !== 'number' || !Number.isFinite(value) || value < lo || value > hi) bad(`${name} must be a number between ${lo} and ${hi}.`); };
 if (!presets.figures.some(f => f.key === body.figureKey)) bad('Unknown figureKey.');
 if (!presets.presets.some(p => p.key === body.preset)) bad('Unknown preset.');
 number('widthMm',40,250); number('heightMm',40,250); number('basePt',5,12); number('dpi',72,1200);
 if (![300,600,1200].includes(body.dpi as number)) bad('dpi must be 300, 600 or 1200.');
 if (!['sans','serif','mono'].includes(body.fontFamily as string)) bad('fontFamily must be sans, serif or mono.');
 if (typeof body.hybridMode !== 'boolean') bad('hybridMode must be true or false.');
 const formats = body.formats;
 if (!Array.isArray(formats) || !formats.length || !formats.every(f => presets.formats.includes(f))) bad(`formats must be a non-empty subset of ${presets.formats.join(', ')}`);
}
// Smallest valid ZIP: an end-of-central-directory record whose comment names the mock.
const mockZip = () => { const comment = new TextEncoder().encode('Nexo mock bundle'), end = new Uint8Array(22 + comment.length), view = new DataView(end.buffer);
 view.setUint32(0,0x06054b50,true); view.setUint16(20,comment.length,true); end.set(comment,22); return new Blob([end],{type:'application/zip'}); };
export const getExportPresets = ():Promise<import('./api/types').ExportPresets> => mock ? enqueue(async()=>structuredClone(mockExportPresets) as import('./api/types').ExportPresets) : request('/export/presets');
export const exportBundle = sessionRoute('exportBundle', (id:string, body:import('./api/types').ExportRequest):Promise<import('./api/types').FileDownload> => mock ? enqueue(async()=>{
 const sent = {...body, ...exportMock.fault}; mockSession(id); mockExportCheck(sent);
 if (sent.figureKey === 'volcano' && !mockSession(id).design?.confirmed) throw new Error('Confirm the study design before exporting the volcano plot.');
 exportMock.last = structuredClone(sent); await new Promise(r => setTimeout(r, 150));
 return {blob:mockZip(), filename:`Mock_${sent.figureKey}_Publication_Bundle.zip`};
}) : enqueue(()=>sendFile(`${path(id)}/export`, 'publication_bundle.zip', body)));
export const cardCsv = sessionRoute('cardCsv', (id:string, instance:string):Promise<import('./api/types').FileDownload> => mock ? enqueue(async()=>{
 const legacy = /^tcinstance_v0_(pca|violin|dist|comp|heat)$/.exec(instance);
 if (!legacy && !cards.has(`${id}/${instance}`)) { mockSession(id); throw new Error('This plot has no single data download; use the publication export.'); }
 exportMock.csv = instance;
 return {blob:new Blob(['feature,group,value\nLipid A,Control,1\nLipid A,Case,2\n'],{type:'text/csv'}), filename:`${legacy?.[1] ?? 'plot'}_data.csv`};
}) : enqueue(()=>sendFile(`${path(id)}/cards/${encodeURIComponent(instance)}/data.csv`, 'plot_data.csv')));
// As the server (export.R api_card_downloads): the module's own download buttons next to the plot.
function mockDownloads(id:string, instance:string):import('./api/types').CardDownload[] {
 const legacy = /^tcinstance_v0_(pca|violin|dist|comp|heat)$/.exec(instance);
 const source = legacy ? `results_dashboard-plot_${legacy[1]}` : cards.get(`${id}/${instance}`)?.source;
 if (!source) { mockSession(id); throw new Error('Unknown card'); }
 const output = source.slice(source.indexOf('-') + 1);
 if (source.startsWith('results_dashboard-')) return [{id:`dl_${output.replace(/^plot_/,'')}`, label:'Plot data (CSV)'}];
 if (/^(heatmap_barchart_tab|lsea_tab)-/.test(source)) return [];
 // b11 F3: the module's configuration download from its sidebar (export.R api_config_download_links).
 if (source.startsWith('pathway_tab-')) return [{id:'downloadCSV', label:'CSV'}, {id:'downloadPlot', label:'PDF'}, {id:'download_config', label:'Download Layout JSON'}];
 if (/^qc_pca_tab-bqc/.test(source)) return [{id:'downloadBqcPdf', label:'BQC PDF'}];
 return [{id:'downloadCSV', label:'CSV'}, {id:'downloadPlot', label:'PDF'}];
}
export const cardDownloads = sessionRoute('cardDownloads', (id:string, instance:string):Promise<{downloads:import('./api/types').CardDownload[]}> => mock ? enqueue(async()=>({downloads:mockDownloads(id,instance)})) : request(`${path(id)}/cards/${encodeURIComponent(instance)}/downloads`));
export const cardDownload = sessionRoute('cardDownload', (id:string, instance:string, download:string):Promise<import('./api/types').FileDownload> => mock ? enqueue(async()=>{
 const item = mockDownloads(id,instance).find(d => d.id === download);
 if (!item) throw new Error('This plot has no such download.');
 if (download === 'downloadBqcPdf' && mockBqcPlaceholder(cards.get(`${id}/${instance}`)?.inputs ?? {})) return mockFailedDownload(422, {error:'download_failed', message:'Team could not build this PDF: select at least 2 BQC replicate samples first.'});
 if (exportMock.downloadFault) { const fault = exportMock.downloadFault; exportMock.downloadFault = null; return mockFailedDownload(422, fault); }
 exportMock.download = {instance, id:download};
 if (download === 'download_config') return {blob:new Blob([mockLayoutDownload(cards.get(`${id}/${instance}`)?.inputs ?? {})],{type:'application/json'}), filename:'pathway_layout_config.json'};
 return /PDF/.test(item.label) ? {blob:new Blob(['%PDF-1.4 mock'],{type:'application/pdf'}), filename:`${download}.pdf`}
  : {blob:new Blob(['feature,group,value\nLipid A,Control,1\nLipid A,Case,2\n'],{type:'text/csv'}), filename:`${download}.csv`};
}) : enqueue(()=>sendFile(`${path(id)}/cards/${encodeURIComponent(instance)}/downloads/${encodeURIComponent(download)}`, `${download}`)));

const analyses = new Map<string, import('./api/types').AnalysisSettings>();
const analysisMock = {patches: [] as Inputs[]};
if (mock) Object.assign(window, {__nexoAnalysisMock: analysisMock});
const analysisOf = (id:string):Promise<import('./api/types').AnalysisSettings> => mock ? enqueue(async () => {
 mockSession(id);
 if (!analyses.has(id)) analyses.set(id, structuredClone(analysisFixture) as unknown as import('./api/types').AnalysisSettings);
 return structuredClone(analyses.get(id)!);
}) : request(`${path(id)}/analysis`);
export const getAnalysis = sessionRoute('getAnalysis', analysisOf);
export async function updateAnalysis(id:string, inputs:Inputs):Promise<import('./api/types').AnalysisSettings> {
 const result = collab() ? await viaIntent('analysis', {}, {inputs}, () => getAnalysis(id)) : await sessionRoute('updateAnalysis', (id:string) => mock ? (async () => {
  const current = await analysisOf(id);
  const controls = current.sections.flatMap(section => section.controls);
  for (const key of Object.keys(inputs)) if (!controls.some(c => c.id === key)) throw Object.assign(new Error(`Unknown analysis setting: ${key}`), {status:400});
  for (const control of controls) if (control.id in inputs) control.value = structuredClone(inputs[control.id]);
  analyses.set(id,current); analysisMock.patches.push(structuredClone(inputs)); return structuredClone(current);
 })() : request<import('./api/types').AnalysisSettings>(`${path(id)}/analysis`, {inputs}, 'PATCH'))(id);
 heldEdits(id).analysis = {...heldEdits(id).analysis, ...structuredClone(inputs)};
 invalidateAnalysis(id); return result;
}

// Team's session palette (pilot F1; frontends/nexo-api/palette.R): session-wide group colours. A change redraws every card.
if (mock) Object.assign(window, {__nexoPaletteMock: mockPaletteCounters});
export const getPalette = sessionRoute('getPalette', (id:string):Promise<SessionPalette> => mock ? enqueue(async () => (mockSession(id), mockPaletteGet(id))) : request(`${path(id)}/palette`));
export async function updatePalette(id:string, change:PaletteChange):Promise<SessionPalette> {
 const result = collab() ? await viaIntent('palette', {}, change, () => getPalette(id)) : await sessionRoute('updatePalette', (id:string) => mock ? enqueue(async () => (mockSession(id), mockPalettePut(id, change))) : request<SessionPalette>(`${path(id)}/palette`, change, 'PATCH'))(id);
 heldEdits(id).palette = structuredClone(result.state);
 invalidateAnalysis(id); return result;
}
/** The mock dashboard traces named after a group take the session palette's colour, as Team's color_maps do. */
function mockSessionColours<T>(id:string, figure:T):T {
 for (const t of ((figure as {data?:Record<string,unknown>[]}).data ?? [])) {
  const colour = typeof t.name === 'string' && mockPaletteGroups.includes(t.name) ? mockPaletteOverride(id, t.name) : undefined; if (!colour) continue;
  t.marker = {...(t.marker as object ?? {}), color:colour}; if (t.line) t.line = {...(t.line as object), color:colour};
 }
 return figure;
}

// Targeted lipid cohort (Team's Single Lipid Analysis Mode; frontends/nexo-api/cohort.R). A change redraws every card.
export type CohortState = import('./mock/cohort').CohortState;
if (mock) Object.assign(window, {__nexoCohortMock: mockCohortCounters});
export const getCohort = sessionRoute('getCohort', (id:string, options?: RequestOptions):Promise<CohortState> => mock ? enqueue(async () => (mockSession(id), mockCohortGet(id)), {...options, shared:true}) : request(`${path(id)}/cohort`, undefined, undefined, undefined, {...options, shared:true}));
export async function setCohort(id:string, lipids:string[]):Promise<CohortState> {
 const result = collab() ? await viaIntent('cohort', {}, {lipids}, () => getCohort(id)) : await sessionRoute('setCohort', (id:string) => mock ? enqueue(async () => (mockSession(id), mockCohortPut(id, {lipids}))) : request<CohortState>(`${path(id)}/cohort`, {lipids}, 'PUT'))(id);
 heldEdits(id).cohort = [...lipids];
 invalidateAnalysis(id); return result;
}

// --- Honest downloads (mock): Team's BQC placeholder and a module download that the API refuses (422 {error,message}).
const MOCK_BQC_PLACEHOLDERS: Record<string, string> = {'qc_pca_tab-bqcPlot':'Please configure at least 2 BQC replicate samples to view plot.',
  'qc_pca_tab-bqcDeviationPlot':'Please configure at least 2 BQC replicate samples.', 'qc_pca_tab-bqcAbundancePlot':'Please configure at least 2 BQC replicate samples.'};
const mockBqcPlaceholder = (inputs:Record<string,unknown>) => !(Array.isArray(inputs.bqcSamples) && inputs.bqcSamples.length >= 2);
async function mockFailedDownload(status:number, body:{error:string;message:string}):Promise<never> {
 const response = new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json'}});
 const value = await response.json().catch(() => ({})) as {message?:string};
 throw new Error(value.message ?? `Request failed (${response.status})`);
}
// A Plotly 3D scene (WebGL) as the PCA/loadings 3D cards draw it.
const mockScene3d = (title:string) => ({data:['Control','Treatment'].map((name,g) => ({type:'scatter3d', mode:'markers', name, x:[1,2,3].map(v=>v+g), y:[2,1,3].map(v=>v-g), z:[3,1,2]})), layout:{title, scene:{xaxis:{title:'PC1'}, yaxis:{title:'PC2'}, zaxis:{title:'PC3'}}}});

// The companion's chat (frontends/nexo-api companion route, built in parallel): one question with the screen and the
// selected card; the reply's Markdown is rendered safely by src/companion/markdown.ts.
export type CompanionAnswer = { text: string; label: string; grounded: boolean };
export function askCompanion(question: string, screen: string, card: string | null): Promise<CompanionAnswer> {
 return mock ? new Promise(done => setTimeout(() => done(mockCompanionAsk(question)), 150)) : request<CompanionAnswer>('/companion/ask', { question, screen, card }, 'POST');
}
