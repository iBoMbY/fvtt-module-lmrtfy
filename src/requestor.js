

class LMRTFYRequestor extends FormApplication {
    constructor(data = undefined) {
        super();
     
        this.selected = data ?? {};

        if (!this.selected.extraRollNotes)
        {
            this.selected.extraRollNotes = [];
        }
        else
        {
            this.selected.extraRollNotes = this.selected.extraRollNotes.map(n => new LMRTFYRollNoteSource(n.selector, n.text, n.outcome, n.title, n.predicate, n.visibility));
        }

        this.actors = {};

        game.users.filter(user => user.character && user.character.id).forEach((user) => {
            this.actors[user.character.id] = user.character;
        });

        const that = this;

        Handlebars.registerHelper('lmrtfy-isSelected', function (property, key = '', subProperty = '') {
            const prop = that.selected[property];

            if (!prop)
                return false;

            if (Array.isArray(prop))
                return prop.includes(key) ?? false;

            if (typeof prop == "boolean")
                return prop;

            if (typeof prop == "string")
              return prop === key;

            if (typeof prop == "object") {
                const sub = prop[subProperty];

                if (sub)
                    return sub === key;
            }

            return false;
        });

        Handlebars.registerHelper('lmrtfy-isEqual', function (val1, val2) {
          return val1 === val2;
        });

        Handlebars.registerHelper('lmrtfy-contains', function (arr, val) {
            return Array.isArray(arr) && arr.includes(val);
        });        
    }

    static get defaultOptions() {
        const options = super.defaultOptions;
        options.title = game.i18n.localize("LMRTFY.Title");
        options.template = "modules/lmrtfy_pf2e/templates/request-rolls.html";
        options.closeOnSubmit = false;
        options.popOut = true;
        options.width = 600;
        options.height = "auto";
        options.classes = ["lmrtfy", "lmrtfy-requestor"];
        if (game.settings.get('lmrtfy_pf2e', 'enableParchmentTheme')) {
          options.classes.push('lmrtfy-parchment');
        }
        return options;
    }

    async getData() {
        // Return data to the template
        const actors = Object.keys(this.actors).map(actor_id => this.actors[actor_id]);

        const skills = Object.keys(LMRTFY.skills)
            .sort((a, b) => game.i18n.localize(LMRTFY.skills[a]).localeCompare(game.i18n.localize(LMRTFY.skills[b])))
            .reduce((acc, skillKey) => {
                acc[skillKey] = LMRTFY.skills[skillKey];
                return acc;
            }, {});

        const lore_skills = {};

        actors.forEach(actor => {
            const a_skills = actor.skills;
            (Object.keys(a_skills).map(key => a_skills[key]).filter(skill => !LMRTFY.skills[skill.slug])).map(skill => lore_skills[skill.slug] = skill.label);
        });

        const extraRollOptions = game.settings.get('lmrtfy_pf2e', 'extraRollOptions')

        return {
            actors,
            saves: LMRTFY.saves,
            skills,
            lore_skills,
            specialRolls: LMRTFY.specialRolls,
            rollModes: CONFIG.Dice.rollModes,
            traits: LMRTFY.traits,
            selected: this.selected,
            outcomes: LMRTFY.outcomes,
            extraRollOptions,
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        $(".chosen-select").chosen();

        this.element.find(".lmrtfy-select-all").click(this._onSubmit.bind(this));
        this.element.find(".lmrtfy-save-roll").click(this._onSubmit.bind(this));
        this.element.find(".add-extra-roll-note").click(this._onSubmit.bind(this))
        this.element.find(".lmrtfy-clear-all").click(this._onSubmit.bind(this))
    }

    initializeData() {
        this.selected = {
            extraRollNotes: []
        };
    }

    close(...args) {
        this.invalid = true;
        return super.close(...args);
    }

    parseFormData(formData) {
        const keys = Object.keys(formData);
        const actors = formData.actors ?? [];
        const saves = keys.filter(k => formData[k] && k.startsWith("save-")).map(k => k.slice(5));
        const skills = formData.skills ?? [];
        if (formData['lore-skills']?.length > 0 ) {
            skills.push(...formData['lore-skills']);
        }
        const { mode, title, message, extraRollOptions } = formData;
        const traits = formData.traits;

        let dc = undefined;
        const dcValue = parseInt(formData.dc);

        if (!isNaN(dcValue)) {
            dc = {
                value: dcValue,
                visibility: formData.visibility
            }
        }

        let extraRollNotes = [];

        if (formData.extraRollNoteIndex) {
            const extraRollNoteIndex = Array.isArray(formData.extraRollNoteIndex) ? formData.extraRollNoteIndex : [formData.extraRollNoteIndex];

            extraRollNotes = extraRollNoteIndex.map(index => {
                return new LMRTFYRollNoteSource(
                    formData["extraRollNoteSelector"+index],
                    formData["extraRollNoteText"+index], 
                    formData["extraRollNoteOutcome"+index], 
                    formData["extraRollNoteTitle"+index],
                    formData["extraRollNotePredicate"+index], 
                    formData["extraRollNoteVisibility"+index],
                );
            }).filter(note => !note.isInitial());
        }

        return {
            actors,
            saves,
            skills,
            mode,
            title,
            message,
            perception: formData['extra-perception'],
            "flat-check": formData['extra-flat-check'],
            chooseOne: formData['choose-one'],
            dc,
            traits,
            extraRollOptions,
            extraRollNotes,
        };
    }

    async _updateObject(event, formData) {
        //console.log("LMRTFY submit: ", formData)

        const selectAll = $(event.currentTarget).hasClass("lmrtfy-select-all");

        if (selectAll) {
            this.selected = this.parseFormData(formData);
            this.selected.actors = Object.keys(this.actors);
            this.render(true);
            return;
        }

        const clearAll = $(event.currentTarget).hasClass("lmrtfy-clear-all");

        if (clearAll) {
            this.initializeData();
            this.render(true);
            return;
        }

        const addExtraRollNote = $(event.currentTarget).hasClass("add-extra-roll-note");

        if (addExtraRollNote) {
            this.selected = this.parseFormData(formData);
            this.selected.extraRollNotes.push(new LMRTFYRollNoteSource());
            this.render(true);
            return;
        }

        const saveAsMacro = $(event.currentTarget).hasClass("lmrtfy-save-roll");

        const socketData = this.parseFormData(formData);
        
        if (socketData.actors.length === 0 ||
             (!socketData.message && socketData.saves.length === 0 && socketData.skills.length === 0 && !socketData.perception && !socketData['flat-check'])) {
            ui.notifications.warn(game.i18n.localize("LMRTFY.NothingNotification"));
            return;
        }
        
        // console.log("LMRTFY socket send : ", socketData)
        if (saveAsMacro) {

            const actorTargets = socketData.actors.map(a => this.actors[a]).filter(a => a).map(a => a.name).join(", ");
            const scriptContent = `// ${socketData.title} ${socketData.message ? " -- " + socketData.message : ""}\n` +
                `// Request rolls from ${actorTargets}\n` +
                `// Saves: ${socketData.saves.map(a => LMRTFY.saves[a]).filter(s => s).join(", ")}\n` +
                `// Skills: ${socketData.skills.map(s => LMRTFY.skills[s]).filter(s => s).join(", ")}\n` +
                `const data = ${JSON.stringify(socketData, null, 2)};\n\n` +
                `game.socket.emit('module.lmrtfy_pf2e', data);\n` +
                `// alternative (preset request window): LMRTFY.requestRoll(data);\n` +
                `// alternative (only pick chars): LMRTFY.pickActorsAndSend(data);\n`;
            const macro = await Macro.create({
                name: "LMRTFY: " + (socketData.message || socketData.title),
                type: "script",
                scope: "global",
                command: scriptContent,
                img: "icons/svg/d20-highlight.svg"
            });
            macro.sheet.render(true);
        } else {
            game.socket.emit('module.lmrtfy_pf2e', socketData);
            // Send to ourselves
            LMRTFY.onMessage(socketData);
            ui.notifications.info(game.i18n.localize("LMRTFY.SentNotification"))
        }
    }
}
