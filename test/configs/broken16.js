module.exports = async () => {
    process.send({error: new Error()});
};
