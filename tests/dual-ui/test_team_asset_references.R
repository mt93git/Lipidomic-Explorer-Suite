# Check actual static asset references rather than only the list of removed files.
files <- list.files('R/frontends/team', pattern='[.]R$',full.names=TRUE,recursive=TRUE)
pattern <- 'team/[A-Za-z0-9_./-]+[.](?:png|jpg|jpeg|webp|svg|js|css|glb|mp4)'
for (f in files) {
 text <- paste(readLines(f,warn=FALSE),collapse='\n')
 paths <- unique(regmatches(text,gregexpr(pattern,text,perl=TRUE))[[1]])
 if (length(paths)) stopifnot(all(file.exists(file.path('www',paths))))
}
for (f in list.files('www/team/js',pattern='[.]js$',full.names=TRUE)) {
 text <- paste(readLines(f,warn=FALSE),collapse='\n')
 stopifnot(!grepl('Run comparison|saved bone preparation sensitivity study',text))
}
stopifnot(file.exists('www/team/models/LICENSE.txt'))
cat('PASS Team static asset links, no obsolete study navigation, explicit model MIT license\n')
