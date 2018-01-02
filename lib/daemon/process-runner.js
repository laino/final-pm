const [NODE,, CWD, ENTRY] = process.argv;

process.chdir(CWD);
process.argv.splice(0, 3, NODE);

require(ENTRY);
