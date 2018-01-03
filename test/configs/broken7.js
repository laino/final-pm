module.exports = async () => {
    new Promise(() => {
        throw new Error('$$$ERROR$$$');
    });
};
