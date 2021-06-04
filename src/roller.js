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

            let {rank, mod} = LMRTFY.getModifierBreakdown(modifier);

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
            let breakdown = this._buildActorsBreakdown(this.actors, (actor) => {
                const skill = actor.data.data.skills[s];

                // get lore skill name
                if (!name) {
                    name = skill.name;
                }

                return skill; 
            });

            skills[s] = { name, breakdown };
        });

        let initiative_breakdown = this.data.initiative ? this._buildActorsBreakdown(this.actors, (actor) => { return actor.data.data.attributes.initiative; }) : "";

        let perception_breakdown = this.data.perception ? this._buildActorsBreakdown(this.actors, (actor) => { return actor.data.data.attributes.perception; }) : "";

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
            this.close();
        }
    }

    _makeAbilityRoll(event, rollMethod, ability) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));

            // system specific roll handling            
            const modifier = LMRTFY.buildAbilityModifier(actor, ability);

            game.pf2e.Check.roll(modifier, { type: 'skill-check', dc: this.dc }, event);
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    _makeSaveRoll(event, save_id) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));

            const save = actor.data.data.saves[save_id];
            const options = actor.getRollOptions(['all', 'saving-throw', save.name]);
            save.roll({ event, options, dc: this.dc });
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    _makeSkillRoll(event, skill_id) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));

            // system specific roll handling
            const skill = actor.data.data.skills[skill_id];

            // roll lore skills only for actors who have them ...
            if (!skill) continue;

            const options = actor.getRollOptions(['all', 'skill-check', skill.name]);
            skill.roll({ event, options, dc: this.dc });
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    _makePerceptionRoll(event) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));

            // system specific roll handling
            const options = actor.getRollOptions(['all', 'perception']);
            actor.data.data.attributes.perception.roll({ event, options, dc: this.dc });
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    _makeInitiativeRoll(event) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));

            // system specific roll handling
            const options = actor.getRollOptions(['all', 'initiative']);
            actor.data.data.attributes.initiative.roll({ event, options });
        }

        game.settings.set("core", "rollMode", rollMode);

        event.currentTarget.disabled = true;

        this._checkClose();
    }

    _tagMessage(data, options) {
      setProperty(data, "flags.lmrtfy", {"message": this.data.message, "data": this.data.attach});
    }

    _makeDiceRoll(event, formula, defaultMessage = null) {
        let chatMessages = []
        for (let actor of this.actors) {
            let chatData = {
              user: game.user._id,
              speaker: ChatMessage.getSpeaker({actor}),
              content: formula,
              flavor: this.message || defaultMessage,
              type: CONST.CHAT_MESSAGE_TYPES.ROLL
            };
            try {
                let data = duplicate(actor.data.data);
                data["name"] = actor.name;
                let roll = new Roll(formula, data).roll();
                chatData.roll = JSON.stringify(roll);
                chatData.sound = CONFIG.sounds.dice;
            } catch(err) {
                chatData.content = `Error parsing the roll formula: ${formula}`
                chatData.roll = null;
                chatData.type = CONST.CHAT_MESSAGE_TYPES.OOC;
            }
        
            // Record additional roll data
            if ( ["gmroll", "blindroll"].includes(this.mode) )
                chatData.whisper = ChatMessage.getWhisperRecipients("GM");
            if ( this.mode === "selfroll" ) chatData.whisper = [game.user._id];
            if ( this.mode === "blindroll" ) chatData.blind = true;
            setProperty(chatData, "flags.lmrtfy", {"message": this.data.message, "data": this.data.attach});
            chatMessages.push(chatData);
        }
        ChatMessage.create(chatMessages, {});

        event.currentTarget.disabled = true;
        this._checkClose();
    }

    _onAbilityCheck(event) {
        event.preventDefault();
        const ability = event.currentTarget.dataset.ability;
        this._makeAbilityRoll(event, LMRTFY.abilityRollMethod, ability);
    }

    _onAbilitySave(event) {
        event.preventDefault();
        const saves = event.currentTarget.dataset.ability;
        this._makeSaveRoll(event, saves);
    }

    _onSkillCheck(event) {
        event.preventDefault();
        const skill = event.currentTarget.dataset.skill;
        this._makeSkillRoll(event, skill);
    }
    _onCustomFormula(event) {
        event.preventDefault();
        this._makeDiceRoll(event, this.data.formula);
    }
    _onInitiative(event) {
        event.preventDefault();
        this._makeInitiativeRoll(event);
    }
    _onDeathSave(event) {
        event.preventDefault();
        this._makeDiceRoll(event, "1d20", game.i18n.localize("LMRTFY.DeathSaveRollMessage"));
    }

    _onPerception(event) {
        event.preventDefault();
        this._makePerceptionRoll(event);
    }
}
