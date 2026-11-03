`%||%`<-function(x,y)if(is.null(x)||!length(x))y else x
source('R/frontends/team/scientific_insight_context.R')
source('R/frontends/team/scientific_insight.R')
papers<-list(list(pmid='123',title='A paper',url='https://pubmed.ncbi.nlm.nih.gov/123/',year='2025'))
good<-list(paragraph='Class-level evidence reports a lipid association in a mouse model [PMID:123]. This does not establish a mechanism in these data.',pmids=list('123'))
stopifnot(team_insight_validate(good,papers)$ok)
for(x in list(list(paragraph=good$paragraph,pmids=list('999')),modifyList(good,list(paragraph=paste(rep('word',121),collapse=' '))),modifyList(good,list(paragraph='Class-level evidence proves a mechanism [PMID:123].')),modifyList(good,list(paragraph='Class-level evidence <script> [PMID:123].')),modifyList(good,list(paragraph='Class-level evidence https://evil.example [PMID:123].')),modifyList(good,list(paragraph='Class-level evidence with no citation.')),c(good,list(actions='remove')))){r<-team_insight_validate(x,papers); if(isTRUE(r$ok)) print(x); stopifnot(!r$ok)}
stopifnot(inherits(try(team_insight_retrieve('SECRET_SAMPLE'),silent=TRUE),'try-error'))
xml<-'<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>123</PMID><Article><ArticleTitle>Primary evidence</ArticleTitle><Abstract><AbstractText>Experimental observations.</AbstractText></Abstract><PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle><PubmedArticle><MedlineCitation><PMID>456</PMID><Article><ArticleTitle>Retracted paper</ArticleTitle><Abstract><AbstractText>Unsupported claim.</AbstractText></Abstract><PublicationTypeList><PublicationType>Retracted Publication</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>'
p<-team_insight_parse_pubmed(xml,c('123','456'));stopifnot(length(p)==1L,p[[1]]$pmid=='123')
# A real empty retrieval must never invoke the model.
old_retrieve<-team_insight_retrieve
team_insight_retrieve<-function(terms)list(papers=list())
Sys.setenv(OPENAI_API_KEY='test-only',LIPIDOMIC_COMPANION_AI='1')
r<-team_insight_complete(list(lipids='PC(34:1)'))
stopifnot(!r$ok,grepl('No suitable abstracts',r$message))
Sys.unsetenv('OPENAI_API_KEY')
stopifnot(!team_insight_complete(list(lipids='PC'))$ok)
cat('PASS citation allowlist, paragraph limit, markup/URL/action rejection, retraction filtering, private term rejection, no-evidence/disabled fail-closed\n')
