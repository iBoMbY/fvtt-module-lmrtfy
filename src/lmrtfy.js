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
                return activeToken.controlled;
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
        //LMRTFY.skills = CONFIG.PF2E.skills; <- broken
        LMRTFY.skills = {
            acrobatics: "PF2E.SkillAcr",
            arcana: "PF2E.SkillArc",
            athletics: "PF2E.SkillAth",
            crafting: "PF2E.SkillCra",
            deception: "PF2E.SkillDec",
            diplomacy: "PF2E.SkillDip",
            intimidation: "PF2E.SkillItm",
            medicine: "PF2E.SkillMed",
            nature: "PF2E.SkillNat",
            occultism: "PF2E.SkillOcc",
            performance: "PF2E.SkillPrf",
            religion: "PF2E.SkillRel",
            society: "PF2E.SkillSoc",
            stealth: "PF2E.SkillSte",
            survival: "PF2E.SkillSur",
            thievery: "PF2E.SkillThi"
        }
        LMRTFY.saves = CONFIG.PF2E.saves;
        LMRTFY.normalRollEvent = { shiftKey: false, altKey: false, ctrlKey: false };
        LMRTFY.advantageRollEvent = { shiftKey: false, altKey: true, ctrlKey: false };
        LMRTFY.disadvantageRollEvent = { shiftKey: false, altKey: false, ctrlKey: true };
        LMRTFY.specialRolls = { 'perception': true, 'flat-check': true };
        LMRTFY.outcomes = {
            criticalFailure: "PF2E.Check.Result.Degree.Check.criticalFailure",
            failure: "PF2E.Check.Result.Degree.Check.failure",
            success: "PF2E.Check.Result.Degree.Check.success",
            criticalSuccess: "PF2E.Check.Result.Degree.Check.criticalSuccess",
        };

        if (game.settings.get('lmrtfy_pf2e', 'deselectOnRequestorRender')) {
            Hooks.on("renderLMRTFYRequestor", () => {
                canvas.tokens.releaseAll();
            })
        }

        const traits = new Map();
        
        LMRTFY.addObjectToMap(CONFIG.PF2E.actionTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.alignmentTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.ancestryItemTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.ancestryTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.armorTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.classTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.consumableTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.creatureTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.damageTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.equipmentTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.featTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.hazardTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.magicSchools, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.magicTraditions, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.npcAttackTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.otherArmorTags, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.otherConsumableTags, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.otherWeaponTags, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.preciousMaterials, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.spellOtherTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.spellTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.vehicleTraits, traits);
        LMRTFY.addObjectToMap(CONFIG.PF2E.weaponTraits, traits);

        LMRTFY.traits = Object.fromEntries(traits);

        LMRTFY.rollResult = new Map();
    }

    static addObjectToMap(obj, map) {
        if (obj) {
            Object.keys(obj).forEach(key => {
                if (!map.has(key)) {
                    map.set(key, obj[key]);
                }
            });
        }
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
            
            data.skills = data.skills.filter(skill => actors.find(actor => actor.skills[skill]));

            if (data.saves.length == 0 && data.skills.length == 0 && !data.perception && !data['flat-check']) return;

            new LMRTFYRoller(actors, data).render(true);
        }
    }
    
    static pickActorsAndSend(data) {
        LMRTFY.picker = new LMRTFYPicker(data);
        LMRTFY.picker.render(true);
    }

    static requestRoll(data = undefined) {
        if (data) {
            LMRTFY.requestor = new LMRTFYRequestor(data);
        } else {
            if (LMRTFY.requestor === undefined)
                LMRTFY.requestor = new LMRTFYRequestor();
        }
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

    static getModifierBreakdown(modifier) {
        const proficencyLevel = [
            'PF2E.ProficiencyLevel0', // untrained
            'PF2E.ProficiencyLevel1', // trained
            'PF2E.ProficiencyLevel2', // expert
            'PF2E.ProficiencyLevel3', // master
            'PF2E.ProficiencyLevel4', // legendary
        ];

        let mod;

        if (modifier.totalModifier == undefined) {
            mod = (modifier.check.mod < 0 ? "" : "+") + modifier.check.mod;
        } else {
            mod = (modifier.totalModifier < 0 ? "" : "+") + modifier.totalModifier;
        }

        let rank = "";

        if (modifier.slug === "initiative") {
            rank = game.i18n.localize(modifier.ability === "perception" ? "LMRTFY.Perception" : LMRTFY.skills[modifier.ability]);
        } else {
            rank = game.i18n.localize(proficencyLevel[modifier.rank ?? 0]);
        }

        return {rank, mod};
    }
}

class LMRTFYRollNoteSource {
    constructor(selector = "all", text = "", outcome = undefined, title = undefined, predicate = undefined, visibility = "all") {
        this._selector = selector;
        this.predicate = predicate;
        this._outcome = outcome ?? [];
        this._visibility = visibility ?? null;
        this._title = title ?? null;
        this._text = text;
    }

    _predicate = [];

    get selector() {
        return this._selector;
    }

    set predicate(value) {
        try 
        {
            if (!value || value.length == 0) {
                this._predicate = [];
                return;
            }

            this._predicate = JSON.parse(value);

            if (!Array.isArray(this._predicate)) {
                this._predicate = [this._predicate];
            }
        }
        catch(e)
        {
            ui.notifications.warn(e);
            this._predicate = value;
        }
    }

    get predicate() {
        return JSON.stringify(this._predicate);
    }

    get outcome() {
        return this._outcome;
    }

    get visibility() {
        return this._visibility;
    }

    get title() {
        return this._title;
    }

    get text() {
        return this._text;
    }

    toJSON() {
        return {
            selector: this._selector,
            predicate: this._predicate,
            outcome: this._outcome,
            visibility: this._visibility,
            title: this._title,
            text: this._text,
        }
      }

    isInitial() {
        return ( !this._selector || this._selector === "all")
            && ( !this._predicate || this._predicate.length == 0 )
            && ( !this._outcome || this._outcome.length == 0 )
            && ( !this._visibility || this._visibility === "all" )
            && ( !this._title || this._title.length == 0 )
            && ( !this._text  || this._text.length == 0 );
    }
}

Hooks.once('init', LMRTFY.init);
Hooks.on('ready', LMRTFY.ready);
Hooks.on('getSceneControlButtons', LMRTFY.getSceneControlButtons);
