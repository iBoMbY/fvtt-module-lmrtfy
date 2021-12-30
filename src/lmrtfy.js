class LMRTFY {
    static async init() {
        game.settings.register('lmrtfy_pf2e', 'enableParchmentTheme', {
            name: game.i18n.localize('LMRTFY.EnableParchmentTheme'),
            hint: game.i18n.localize('LMRTFY.EnableParchmentThemeHint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true,
            onChange: (value) => LMRTFY.onThemeChange(value)
        });
        game.settings.register('lmrtfy_pf2e', 'deselectOnRequestorRender', {
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
        game.socket.on('module.lmrtfy_pf2e', LMRTFY.onMessage);

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

        if (game.settings.get('lmrtfy_pf2e', 'deselectOnRequestorRender')) {
            Hooks.on("renderLMRTFYRequestor", () => {
                canvas.tokens.releaseAll();
            })
        }
    }

    static onMessage(data) {
        //console.log("LMRTF got message: ", data)
        let actors = [];
        if (data?.user === 'no-check') {
            actors = data.actors.map(id => game.actors.get(id));
        } else {
            actors = data.actors.map(id => game.actors.get(id)).filter(a => a == game.user.character);
        }

        if (actors.length === 0) return;
        
        data.skills = data.skills.filter(skill => actors.find(actor => actor.data.data.skills[skill]));

        if (data.abilities.length == 0 && data.saves.length == 0 && data.skills.length == 0 && data.formula.length === 0 && !data.deathsave && !data.initiative && !data.perception) return;

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

    static buildAbilityModifier(actor, ability) {
        const modifiers = [];

        const mod = game.pf2e.AbilityModifier.fromScore(ability, actor.data.data.abilities[ability].value);
        modifiers.push(mod);

        const rules = actor.items
            .reduce((rules, item) => rules.concat(game.pf2e.RuleElements.fromOwnedItem(item)), [])
            .filter((rule) => !rule.ignored);

        const { statisticsModifiers } = actor.prepareCustomModifiers(rules);
        
        [`${ability}-based`, 'ability-check', 'all'].forEach((key) => {
            (statisticsModifiers[key] || []).map((m) => duplicate(m)).forEach((m) => modifiers.push(m));
        });
        
        return new game.pf2e.StatisticModifier(`${game.i18n.localize('LMRTFY.AbilityCheck')} ${game.i18n.localize(mod.name)}`, modifiers);
    } 
    
    static getModifierBreakdown(modifier) {
        const proficencyLevel = [
            'PF2E.ProficiencyLevel0', // untrained
            'PF2E.ProficiencyLevel1', // trained
            'PF2E.ProficiencyLevel2', // expert
            'PF2E.ProficiencyLevel3', // master
            'PF2E.ProficiencyLevel4', // legendary
        ];

        const mod = (modifier.totalModifier < 0 ? "" : "+") + modifier.totalModifier;

        let rank = "";

        if (modifier.name === "initiative") {
            rank = game.i18n.localize(modifier.ability === "perception" ? "LMRTFY.Perception" : LMRTFY.skills[modifier.ability]);
        } else {
            rank = game.i18n.localize(proficencyLevel[modifier.rank ?? 0]);
        }

        return {rank, mod};
    }
}

Hooks.once('init', LMRTFY.init);
Hooks.on('ready', LMRTFY.ready);
Hooks.on('getSceneControlButtons', LMRTFY.getSceneControlButtons);
