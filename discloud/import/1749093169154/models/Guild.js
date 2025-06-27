// models/Guild.js

const { Schema, model } = require('mongoose');

const guildSchema = new Schema({
    guildId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    name: { 
        type: String, 
        required: true 
    },
    vitorias: { 
        type: Number, 
        default: 0 
    },
    derrotas: { 
        type: Number, 
        default: 0 
    },
    // Você pode adicionar outros campos aqui no futuro se precisar
}, { timestamps: true }); // Adiciona os campos createdAt e updatedAt automaticamente

const Guild = model('Guild', guildSchema);

module.exports = Guild;