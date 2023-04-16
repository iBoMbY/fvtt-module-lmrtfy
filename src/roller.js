class LMRTFYRoller extends Application {

    constructor(actors, data) {
        super();
        this.actors = actors;
        this.data = data;
        this.saves = data.saves;
        this.skills = data.skills;
        this.mode = data.mode;
        this.message = data.message;
        this.dc = data.dc;
        this.chooseOne = data.chooseOne ?? false;
        if (data.title) {
            this.options.title = data.title;
        }
        if (data.rollId) {
            this.rollId = data.rollId;
        }
        this.rollResults = new Map();
        this.traits = data.traits;
        this.extraRollOptions = data.extraRollOptions;
        this.extraRollNotes = data.extraRollNotes;
    }

    static get defaultOptions() {
        const options = super.defaultOptions;
        options.title = game.i18n.localize("LMRTFY.Title");
        options.template = "modules/lmrtfy_pf2e/templates/roller.html";
        options.popOut = true;
        options.width = 400;
        options.height = "auto";
        options.classes = ["lmrtfy", "lmrtfy-roller"];
        if (game.settings.get('lmrtfy_pf2e', 'enableParchmentTheme')) {
          options.classes.push('lmrtfy-parchment');
        }
        return options;
    }

    _buildActorsBreakdown(actors, get_modifier) {
        let breakdown = "";

        actors.forEach(actor => {
            const modifier = get_modifier(actor);

            const {rank, mod} = LMRTFY.getModifierBreakdown(modifier);

            if (this.actors.length == 1) {
                breakdown = `${rank} ${mod}`;
            } else {
                breakdown += `${breakdown.length > 0 ? "; " : ""}${actor.name}: ${mod}`;
            }
        });

        return breakdown;
    }

    async getData() {
        let note = ""
        let saves = {}
        let skills = {}

        this.saves.forEach(s => {
            saves[s] = { 
                name: LMRTFY.saves[s], 
                breakdown: this._buildActorsBreakdown(this.actors, (actor) => { return actor.saves[s]; })
            }
        });

        this.skills.forEach(s => { 
            let name = LMRTFY.skills[s];
            const breakdown = this._buildActorsBreakdown(this.actors, (actor) => {
                const skill = actor.skills[s];

                // get lore skill name
                if (!name) {
                    name = skill.label;
                }

                return skill; 
            });

            skills[s] = { name, breakdown };
        });

        const perception_breakdown = this.data.perception ? this._buildActorsBreakdown(this.actors, (actor) => { return actor.attributes.perception; }) : "";

        return {
            actors: this.actors,
            saves: saves,
            skills: skills,
            note: note,
            message: this.message,
            perception: this.data.perception ?? false,
            perception_breakdown,
            "flat-check": this.data['flat-check'] ?? false,
            chooseOne: this.chooseOne
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.element.find(".lmrtfy-ability-save").click(this._onAbilitySave.bind(this))
        this.element.find(".lmrtfy-skill-check").click(this._onSkillCheck.bind(this))
        if(LMRTFY.specialRolls['perception']) {
            this.element.find(".lmrtfy-perception").click(this._onPerception.bind(this))
        }
        if(LMRTFY.specialRolls['flat-check']) {
            this.element.find(".lmrtfy-flat-check").click(this._onFlatCheck.bind(this))
        }        
    }

    _checkClose() {
        if (this.element.find("button").filter((i, e) => !e.disabled).length === 0 || this.chooseOne) {
            if (this.rollId) {
                LMRTFY.storeRollResults(this.rollResults, this.rollId);
            }

            this.close();
        }
    }

    handleCallback(actorId, type, name, roll, outcome, message) {
        if (this.rollId) {
            let rollStore = this.rollResults.get(actorId);

            if (!rollStore) {
                rollStore = [];
                this.rollResults.set(actorId, rollStore);
            }

            rollStore.push({
                type,
                name,
                roll,
                outcome,
                message
            });
        }
    }

    extractExtraRollOptions(extraRollOptions) {
        let result = [];

        if (extraRollOptions && extraRollOptions.length > 0) {
            result = extraRollOptions.split(',').map(o => o.trim());
        }

        return result;
    }

    async _makeFlatCheck(event) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        const options = this.extractExtraRollOptions(this.extraRollOptions);

        const modifier = new game.pf2e.StatisticModifier(game.i18n.localize('PF2E.FlatCheck'), [], ['flat-check']);

        const traits = this.traits.map(trait => {
            return {
                name: trait,
                label: game.i18n.localize(CONFIG.PF2E.actionTraits[trait] ?? trait),
                description: game.i18n.localize(CONFIG.PF2E.traitsDescriptions[trait] ?? '' )
            };
        });

        for (let actor of this.actors) {
            await game.pf2e.Check.roll(modifier, { type: 'flat-check', dc: this.dc, traits, notes: this.extraRollNotes, options, actor }, event, async (roll, outcome, message) => {
                this.handleCallback(actor.id, 'flat-check', roll, outcome, message);
            });
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();        
    }

    async _makeSaveRoll(event, save_id) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        const extraRollOptions = this.extractExtraRollOptions(this.extraRollOptions);

        for (let actor of this.actors) {
            await actor.saves[save_id].check.roll({ event, dc: this.dc, traits: this.traits, extraRollOptions, extraRollNotes: this.extraRollNotes, callback: async (roll, outcome, message) => {
                this.handleCallback(actor.id, 'save', save_id, roll, outcome, message);
            }});
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    async _makeSkillRoll(event, skill_id) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        const extraRollOptions = this.extractExtraRollOptions(this.extraRollOptions);

        for (let actor of this.actors) {
            const check = actor.skills[skill_id].check;

            if (!check) continue;

            await check.roll({ event, dc: this.dc, traits: this.traits, extraRollOptions, extraRollNotes: this.extraRollNotes, callback: async (roll, outcome, message) => {
                this.handleCallback(actor.id, 'skill', skill_id, roll, outcome, message);
            }});
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    async _makePerceptionRoll(event) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        const extraRollOptions = this.extractExtraRollOptions(this.extraRollOptions);

        for (let actor of this.actors) {
            const check = actor.perception ?? actor.attributes.perception;

            await check.roll({ event, dc: this.dc, traits: this.traits, extraRollOptions, extraRollNotes: this.extraRollNotes, callback: async (roll, outcome, message) => {
                this.handleCallback(actor.id, 'perception', 'perception', roll, outcome, message);
            }});
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    async _onFlatCheck(event) {
        event.preventDefault();
        this._makeFlatCheck(event);
    }

    async _onAbilitySave(event) {
        event.preventDefault();
        const saves = event.currentTarget.dataset.ability;
        this._makeSaveRoll(event, saves);
    }

    async _onSkillCheck(event) {
        event.preventDefault();
        const skill = event.currentTarget.dataset.skill;
        this._makeSkillRoll(event, skill);
    }

    async _onPerception(event) {
        event.preventDefault();
        this._makePerceptionRoll(event);
    }
}
