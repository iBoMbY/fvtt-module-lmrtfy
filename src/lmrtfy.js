class LMRTFY {
    static async init() {
        game.settings.register('lmrtfy', 'enableParchmentTheme', {
            name: game.i18n.localize('LMRTFY.EnableParchmentTheme'),
            hint: game.i18n.localize('LMRTFY.EnableParchmentThemeHint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true,
            onChange: (value) => LMRTFY.onThemeChange(value)
        });
        game.settings.register('lmrtfy', 'deselectOnRequestorRender', {
            name: game.i18n.localize('LMRTFY.DeselectOnRequestorRender'),
            hint: game.i18n.localize('LMRTFY.DeselectOnRequestorRenderHint'),
            scope: 'world',
            config: true,
            type: Boolean,
            default: false,
            onChange: () => window.location.reload()
        });

        Handlebars.registerHelper('lmrtfy-controlledToken', function (actor) {
            const activeToken = actor.getActiveTokens()[0];
            if (activeToken) {
                return activeToken._controlled;
            } else {
                return false;
            }
        });
    }

    static ready() {
        game.socket.on('module.lmrtfy', LMRTFY.onMessage);

        LMRTFY.saveRollMethod = 'rollSave';
        LMRTFY.abilityRollMethod = 'rollAbility';
        LMRTFY.skillRollMethod = 'rollSkill';
        LMRTFY.abilities = CONFIG.PF2E.abilities;
        LMRTFY.skills = CONFIG.PF2E.skills;
        LMRTFY.saves = CONFIG.PF2E.saves;
        LMRTFY.normalRollEvent = { shiftKey: false, altKey: false, ctrlKey: false };
        LMRTFY.advantageRollEvent = { shiftKey: false, altKey: true, ctrlKey: false };
        LMRTFY.disadvantageRollEvent = { shiftKey: false, altKey: false, ctrlKey: true };
        LMRTFY.specialRolls = { 'initiative': true, 'deathsave': true, 'perception': true };

        if (game.settings.get('lmrtfy', 'deselectOnRequestorRender')) {
            Hooks.on("renderLMRTFYRequestor", () => {
                canvas.tokens.releaseAll();
            })
        }
    }

    static onMessage(data) {
        //console.log("LMRTF got message: ", data)
        const actors = data.actors.map(id => game.actors.get(id)).filter(a => a.owner);
        if (actors.length === 0) return;
        new LMRTFYRoller(actors, data).render(true);
    }
    static requestRoll() {
        if (LMRTFY.requestor === undefined)
            LMRTFY.requestor = new LMRTFYRequestor();
        LMRTFY.requestor.render(true);
    }

    static onThemeChange(enabled) {
        $(".lmrtfy.lmrtfy-requestor,.lmrtfy.lmrtfy-roller").toggleClass("lmrtfy-parchment", enabled)
        if (!LMRTFY.requestor) return;
        if (enabled)
            LMRTFY.requestor.options.classes.push("lmrtfy-parchment")
        else
            LMRTFY.requestor.options.classes = LMRTFY.requestor.options.classes.filter(c => c !== "lmrtfy-parchment")
        // Resize to fit the new theme
        if (LMRTFY.requestor.element.length)
            LMRTFY.requestor.setPosition({ width: "auto", height: "auto" })
    }

    static getSceneControlButtons(buttons) {
        let tokenButton = buttons.find(b => b.name == "token")

        if (tokenButton) {
            tokenButton.tools.push({
                name: "request-roll",
                title: game.i18n.localize('LMRTFY.ControlTitle'),
                icon: "fas fa-dice-d20",
                visible: game.user.isGM,
                onClick: () => LMRTFY.requestRoll(),
                button: true
            });
        }
    }

    static async hideBlind(app, html, msg) {
        if (msg.message.flags && msg.message.flags.lmrtfy) {
            if (msg.message.flags.lmrtfy.blind && !game.user.isGM) {
                msg.content = '<p>??</p>';
                
                let idx = html[0].innerHTML.indexOf('<div class="message-content">');
                html[0].innerHTML = html[0].innerHTML.substring(0, idx);
                html[0].innerHTML += `<div class="message-content">${msg.content}</div>`;
            }
        }
    }
}

Hooks.once('init', LMRTFY.init);
Hooks.on('ready', LMRTFY.ready);
Hooks.on('getSceneControlButtons', LMRTFY.getSceneControlButtons);
Hooks.on('renderChatMessage', LMRTFY.hideBlind);
