// handlers/utils/constants.js
// Módulo para armazenar constantes e funções utilitárias relacionadas a cores.

const COLOR_MAP = {
    'default': '#000000', 'blue': '#3498DB', 'green': '#2ECC71', 'grey': '#95A5A6', 'gray': '#95A5A6',
    'red': '#E74C3C', 'dark_red': '#992D22', 'dark_blue': '#206694', 'dark_green': '#1ABC9C',
    'purple': '#9B59B6', 'yellow': '#FEE75C', 'gold': '#F1C40F', 'orange': '#E67E22',
    'fuchsia': '#EB459E', 'dark_purple': '#71368A', 'navy': '#34495E', 'dark_navy': '#2C3E50',
    'luminous_vivid_pink': '#FF007F', 'dark_gold': '#C27C0E', 'dark_orange': '#A84300',
    'dark_vivid_cyan': '#009778', 'light_grey': '#BCC0C0', 'light_gray': '#BCC0C0',
    'dark_theme': '#2C2F33', 'blurple': '#5865F2', 'not_quite_black': '#23272A',
    'white': '#FFFFFF', 'black': '#000000',
};

const COOLDOWN_DAYS = 3;
const MAX_ROSTER_SIZE = 5;
const TEAM_MAX_ROSTER_SIZE = 5;

/**
 * Resolve uma string de cor em um formato de cor hexadecimal que o Discord aceita.
 * Suporta nomes de cores predefinidos, códigos hexadecimais ou 'random'.
 * @param {string} colorString - A string de cor a ser resolvida (ex: "red", "#FF0000", "random").
 * @param {Object} globalConfig - A configuração global do bot, para fallback da cor padrão.
 * @returns {string|number} O código hexadecimal da cor (como string) ou um número aleatório para 'random'.
 */
function resolveDisplayColor(colorString, globalConfig) {
    // Se a string de cor é nula ou vazia, retorna a cor de embed padrão da configuração global.
    if (!colorString) return globalConfig?.embedColor || '#3498DB'; 

    const lowerCaseColor = colorString.toLowerCase();
    
    // Se for 'random', retorna um número hexadecimal aleatório.
    if (lowerCaseColor === 'random') {
        return Math.floor(Math.random() * 0xFFFFFF);
    }
    // Se o nome da cor está no mapa, retorna o valor hexadecimal correspondente.
    if (COLOR_MAP[lowerCaseColor]) {
        return COLOR_MAP[lowerCaseColor];
    }
    // Se for um código hexadecimal válido, retorna-o.
    if (/^#([0-9A-F]{3}){1,2}$/i.test(colorString)) {
        return colorString;
    }
    // Caso contrário, retorna a cor de embed padrão da configuração global.
    return globalConfig?.embedColor || '#3498DB';
}

module.exports = {
    COLOR_MAP,
    resolveDisplayColor,
    COOLDOWN_DAYS,
    MAX_ROSTER_SIZE,
    TEAM_MAX_ROSTER_SIZE,  
};
