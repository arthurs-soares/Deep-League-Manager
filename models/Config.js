// models/Config.js
const { Schema, model } = require('mongoose');

const configSchema = new Schema({
    _id: { type: String, required: true }, // Ex: 'leaderboard'
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
});

const Config = model('Config', configSchema);
module.exports = Config;