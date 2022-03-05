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

        LMRTFY.rollResult = new Map();
    }

    static onMessage(data) {
        if (data?.type) {
            switch (data.type) {
                case 'rollCallback':
                    if (game.user.isGM) { // Only store remote results for the GM
                        const rollStore = LMRTFY.getRollStore(data.actorId);
                
                        rollStore.set(data.rollId, data.result);
                    }
                    break;

                case 'rollDelete':
                    LMRTFY.deleteStoredRoll(data.actorId, data.rollId);
                    break;
            }
        } else {
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
    }
    
    static requestRoll() {
        if (LMRTFY.requestor === undefined)
            LMRTFY.requestor = new LMRTFYRequestor();
        LMRTFY.requestor.render(true);
    }

    static getRollStore(actorId) {
        let rollStore = LMRTFY.rollResult.get(actorId);

        if (!rollStore) {
            rollStore = new Map();
            LMRTFY.rollResult.set(actorId, rollStore);
        }

        return rollStore;
    }

    static deleteStoredRoll(actorId, rollId) {
        const rollStore = LMRTFY.rollResult.get(actorId);

        if (rollStore) {
            rollStore.delete(rollId);
        };
    }

    static storeRollResults(rollResults, rollId) {
        rollResults.forEach((result, actorId) => {
            const rollStore = LMRTFY.getRollStore(actorId);
            
            rollStore.set(rollId, result);

            const socketData = {
                type: 'rollCallback',
                actorId,
                rollId,
                result,
            }
    
            game.socket.emit('module.lmrtfy_pf2e', socketData);            
        });
    }

    static async removeResult(actorId, rollId) {
        LMRTFY.deleteStoredRoll(actorId, rollId);

        const socketData = {
            type: 'rollDelete',
            actorId,
            rollId,
        }

        game.socket.emit('module.lmrtfy_pf2e', socketData);             
    }

    static async waitForResult(actorId, rollId, timeout = 120, deleteResult = true) {
        const timeoutTick = 500;
        const timeoutMillis = timeout * 1000;
        let timeoutCounter = 0;

        const rollStore = LMRTFY.getRollStore(actorId);

        while (true) {
            const result = rollStore.get(rollId);

            if (result) {
                const resultCopy = duplicate(result);

                if (deleteResult) {
                    LMRTFY.removeResult(actorId, rollId);
                }
                
                return resultCopy;
            } else {
                if ( timeoutCounter >= timeoutMillis ) {
                    return Promise.reject('timeout');
                }
                await new Promise(r => setTimeout(r, timeoutTick)); // Sleep
                timeoutCounter += timeoutTick;
            }
        }
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

    static extractModifiers(modifiers, selectors, options) {
        return selectors
            .flatMap((selector) => modifiers[selector] ?? [])
            .map((m) => m(options) ?? [])
            .flat();
    }

    static buildAbilityModifier(actor, ability) {
        // Start with basic ability modifier
        const modifiers = [game.pf2e.AbilityModifier.fromScore(ability, actor.data.data.abilities[ability].value)];

        // Add conditional modifiers from actor
        const domains = [`${ability}-based`, 'ability-check', 'all'];
        modifiers.push(...this.extractModifiers(actor.synthetics.statisticsModifiers, domains));

        // build and return combined StatisticModifier from modifier list
        return new game.pf2e.StatisticModifier(`${game.i18n.localize('LMRTFY.AbilityCheck')} ${game.i18n.localize(LMRTFY.abilities[ability])}`, modifiers);
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
