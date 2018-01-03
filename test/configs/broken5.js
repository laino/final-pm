module.exports = async () => {
    setImmediate(() => {
        throw new Error('$$$ERROR$$$');
    });
};
