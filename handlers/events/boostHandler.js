// handlers/events/boostHandler.js
const { EmbedBuilder } = require('discord.js');

const BOOST_THANK_YOU_CHANNEL_ID = '1363223305611509922';
const BOOSTER_ROLE_ID = '1362469514029170778'; // Role for boosters

async function handleBoostUpdate(oldMember, newMember, client, globalConfig) {
    const wasBoosting = oldMember.premiumSinceTimestamp !== null;
    const isBoosting = newMember.premiumSinceTimestamp !== null;

    // User started boosting
    if (!wasBoosting && isBoosting) {
        console.log(`[BOOST EVENT] ${newMember.user.tag} (${newMember.id}) started boosting the server ${newMember.guild.name}.`);

        // Send thank you message
        const thankYouChannel = await newMember.guild.channels.fetch(BOOST_THANK_YOU_CHANNEL_ID).catch(err => {
            console.error(`[BOOST EVENT] Could not fetch thank you channel (${BOOST_THANK_YOU_CHANNEL_ID}):`, err);
            return null;
        });

        if (thankYouChannel) {
            const thankYouEmbed = new EmbedBuilder()
                .setColor(globalConfig.embedColor || '#FFC0CB') // Pink for boosts, or default
                .setTitle('🎉 Novo Boost no Servidor! 🎉')
                .setDescription(`${newMember.toString()} acaba de impulsionar o servidor! Muito obrigado pelo seu apoio! 💖`)
                .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            
            thankYouChannel.send({ embeds: [thankYouEmbed] }).catch(err => {
                console.error(`[BOOST EVENT] Could not send thank you message to channel ${BOOST_THANK_YOU_CHANNEL_ID}:`, err);
            });
        }

        // Assign booster role
        const boosterRole = await newMember.guild.roles.fetch(BOOSTER_ROLE_ID).catch(err => {
            console.error(`[BOOST EVENT] Could not fetch booster role (${BOOSTER_ROLE_ID}):`, err);
            return null;
        });

        if (boosterRole) {
            newMember.roles.add(boosterRole)
                .then(() => console.log(`[BOOST EVENT] Added role ${boosterRole.name} to ${newMember.user.tag}.`))
                .catch(err => console.error(`[BOOST EVENT] Could not add booster role to ${newMember.user.tag}:`, err));
        }
    }
    // User stopped boosting
    else if (wasBoosting && !isBoosting) {
        console.log(`[BOOST EVENT] ${newMember.user.tag} (${newMember.id}) stopped boosting the server ${newMember.guild.name}.`);

        // Remove booster role
        const boosterRole = await newMember.guild.roles.fetch(BOOSTER_ROLE_ID).catch(err => {
            console.error(`[BOOST EVENT] Could not fetch booster role (${BOOSTER_ROLE_ID}) for removal:`, err);
            return null;
        });

        if (boosterRole && newMember.roles.cache.has(BOOSTER_ROLE_ID)) {
            newMember.roles.remove(boosterRole)
                .then(() => console.log(`[BOOST EVENT] Removed role ${boosterRole.name} from ${newMember.user.tag}.`))
                .catch(err => console.error(`[BOOST EVENT] Could not remove booster role from ${newMember.user.tag}:`, err));
        }
         // Optional: Send a message if they stop boosting
        const thankYouChannel = await newMember.guild.channels.fetch(BOOST_THANK_YOU_CHANNEL_ID).catch(() => null);
        if (thankYouChannel) {
            thankYouChannel.send(`${newMember.user.tag} não está mais impulsionando o servidor. Agradecemos pelo tempo de apoio!`).catch(err => {
                console.error(`[BOOST EVENT] Could not send boost stop message to channel ${BOOST_THANK_YOU_CHANNEL_ID}:`, err);
            });
        }
    }
}

module.exports = {
    handleBoostUpdate,
};

