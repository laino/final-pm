module.exports = () => {
    new Promise(() => {
        throw new Error('$$$ERROR$$$');
    });
};
