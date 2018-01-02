const [,, CWD, ENTRY] = process.argv;

process.chdir(CWD);
process.argv.splice(1, 2);

require(ENTRY);
