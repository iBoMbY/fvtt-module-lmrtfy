class LMRTFYRoller extends Application {

    constructor(actors, data) {
        super();
        this.actors = actors;
        this.data = data;
        this.abilities = data.abilities;
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

    static requestAbilityChecks(actor, abilities, options={}) {
        if (!actor || !abilities) return;
        if (typeof(abilities) === "string") abilities = [abilities];
        const data = mergeObject(options, {
            abilities: [],
            saves: [],
            skills: []
        }, {inplace: false});
        data.abilities = abilities;
        new LMRTFYRoller([actor], data).render(true);
    }
    static requestSkillChecks(actor, skills, options={}) {
        if (!actor || !skills) return;
        if (typeof(skills) === "string") skills = [skills];
        const data = mergeObject(options, {
            abilities: [],
            saves: [],
            skills: []
        }, {inplace: false});
        data.skills = skills;
        new LMRTFYRoller([actor], data).render(true);
    }
    static requestSavingThrows(actor, saves, options={}) {
        if (!actor || !saves) return;
        if (typeof(saves) === "string") saves = [saves];
        const data = mergeObject(options, {
            abilities: [],
            saves: [],
            skills: []
        }, {inplace: false});
        data.saves = saves;
        new LMRTFYRoller([actor], data).render(true);
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
        let abilities = {}
        let saves = {}
        let skills = {}

        this.abilities.forEach(a => {
            abilities[a] = { 
                name: LMRTFY.abilities[a], 
                breakdown: this._buildActorsBreakdown(this.actors, (actor) => { return LMRTFY.buildAbilityModifier(actor, a); })
            };
        });

        this.saves.forEach(s => {
            saves[s] = { 
                name: LMRTFY.saves[s], 
                breakdown: this._buildActorsBreakdown(this.actors, (actor) => { return actor.data.data.saves[s]; })
            }
        });

        this.skills.forEach(s => { 
            let name = LMRTFY.skills[s];
            const breakdown = this._buildActorsBreakdown(this.actors, (actor) => {
                const skill = actor.data.data.skills[s];

                // get lore skill name
                if (!name) {
                    name = skill.name;
                }

                return skill; 
            });

            skills[s] = { name, breakdown };
        });

        const initiative_breakdown = this.data.initiative ? this._buildActorsBreakdown(this.actors, (actor) => { return actor.data.data.attributes.initiative; }) : "";

        const perception_breakdown = this.data.perception ? this._buildActorsBreakdown(this.actors, (actor) => { return actor.data.data.attributes.perception; }) : "";

        return {
            actors: this.actors,
            abilities: abilities,
            saves: saves,
            skills: skills,
            note: note,
            message: this.message,
            customFormula: this.data.formula || false,
            deathsave: this.data.deathsave ?? false,
            initiative: this.data.initiative ?? false,
            initiative_breakdown,
            perception: this.data.perception ?? false,
            perception_breakdown,
            chooseOne: this.chooseOne
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.element.find(".lmrtfy-ability-check").click(this._onAbilityCheck.bind(this))
        this.element.find(".lmrtfy-ability-save").click(this._onAbilitySave.bind(this))
        this.element.find(".lmrtfy-skill-check").click(this._onSkillCheck.bind(this))
        this.element.find(".lmrtfy-custom-formula").click(this._onCustomFormula.bind(this))
        if(LMRTFY.specialRolls['initiative']) {
            this.element.find(".lmrtfy-initiative").click(this._onInitiative.bind(this))
        }
        if(LMRTFY.specialRolls['deathsave']) {
            this.element.find(".lmrtfy-death-save").click(this._onDeathSave.bind(this))
        }
        if(LMRTFY.specialRolls['perception']) {
            this.element.find(".lmrtfy-perception").click(this._onPerception.bind(this))
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

    async _makeAbilityRoll(event, rollMethod, ability) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            const modifier = LMRTFY.buildAbilityModifier(actor, ability);

            await game.pf2e.Check.roll(modifier, { type: 'skill-check', dc: this.dc, actor }, event, async (roll, outcome, message) => {
                this.handleCallback(actor.id, 'ability', ability, roll, outcome, message);
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

        for (let actor of this.actors) {
            await actor.saves[save_id].check.roll({ event, dc: this.dc, callback: async (roll, outcome, message) => {
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

        for (let actor of this.actors) {
            const check = actor.skills[skill_id].check;

            if (!check) continue;

            await check.roll({ event, dc: this.dc, callback: async (roll, outcome, message) => {
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

        for (let actor of this.actors) {
            const check = actor.data.data.attributes.perception;

            await check.roll({ event, dc: this.dc, callback: async (roll, outcome, message) => {
                this.handleCallback(actor.id, 'perception', 'perception', roll, outcome, message);
            }});
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    async _makeInitiativeRoll(event) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            const check = actor.data.data.attributes.initiative;

            await check.roll({ event, callback: async (roll, outcome, message) => {
                if (this.rollId) {
                    LMRTFY.handleCallback(actor.id, 'initiative', check.ability, this.rollId, roll, outcome, message);
                }
            }});
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    async _makeRecoveryRoll(event) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            actor.rollRecovery();
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    async _makeDiceRoll(event, formula, defaultMessage = null) {
        const messageFlag = {"message": this.data.message, "data": this.data.attach};
        
        Promise.resolve(Promise.all(this.actors.map(async (actor) => {
            const rollData = actor.getRollData();
            const roll = new Roll(formula, rollData);
            
            roll.toMessage({"flags.lmrtfy": messageFlag}, {rollMode: this.mode, create: false}).then(async (messageData) => {
                const speaker = ChatMessage.getSpeaker({actor: actor});

                messageData.update({
                    speaker: {
                        alias: speaker.alias,
                        scene: speaker.scene,
                        token: speaker.token,
                        actor: speaker.actor,
                    },
                    flavor: this.message || defaultMessage,
                });

                return ChatMessage.create(messageData);
            });
        })));

        event.currentTarget.disabled = true;
        this._checkClose();
    }

    async _onAbilityCheck(event) {
        event.preventDefault();
        const ability = event.currentTarget.dataset.ability;
        this._makeAbilityRoll(event, LMRTFY.abilityRollMethod, ability);
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

    async _onCustomFormula(event) {
        event.preventDefault();
        this._makeDiceRoll(event, this.data.formula);
    }
    
    async _onInitiative(event) {
        event.preventDefault();
        this._makeInitiativeRoll(event);
    }

    async _onDeathSave(event) {
        event.preventDefault();
        this._makeRecoveryRoll(event);
    }

    async _onPerception(event) {
        event.preventDefault();
        this._makePerceptionRoll(event);
    }
}
