

class LMRTFYRequestor extends FormApplication {
    constructor(data = undefined) {
        super();
     
        game.users.apps.push(this);

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
        this.selected_actors = [];

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
        options.id = "lmrtfy";
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

        return {
            actors,
            abilities: LMRTFY.abilities,
            saves: LMRTFY.saves,
            skills,
            lore_skills,
            specialRolls: LMRTFY.specialRolls,
            rollModes: CONFIG.Dice.rollModes,
            traits: LMRTFY.traits,
            selected: this.selected,
            outcomes: LMRTFY.outcomes,
        };
    }

    render(force, context={}) {
        // Only re-render if needed
        const {action, data} = context;
        if (action && !["create", "update", "delete"].includes(action)) return;
        if (action === "update" && !data.some(d => "character" in d)) return;
        if (force !== true && !action) return;
        return super.render(force, context);
      }
    
    activateListeners(html) {
        super.activateListeners(html);

        $(".chosen-select").chosen();

        this.element.find(".select-all").click((event) => this._setActorSelection(event, true));
        this.element.find(".deselect-all").click((event) => this._setActorSelection(event, false));
        this.element.find(".lmrtfy-save-roll").click(this._onSubmit.bind(this));
        this.element.find(".add-extra-roll-note").click(this._onSubmit.bind(this))
        this.element.find(".lmrtfy-clear-all").click(this._onSubmit.bind(this))
        this.element.find(".lmrtfy-extra-initiative").hover(this._onHoverAbility.bind(this));
        this.element.find(".lmrtfy-extra-perception").hover(this._onHoverAbility.bind(this));
        this.element.find(".lmrtfy-ability").hover(this._onHoverAbility.bind(this));
        this.element.find(".lmrtfy-skill").hover(this._onHoverAbility.bind(this));
        this.element.find(".lmrtfy-lore-skill").hover(this._onHoverAbility.bind(this));
        const actors = this.element.find(".lmrtfy-actor");
        actors.hover(this._onHoverActor.bind(this));
        actors.click(this._onClickActor.bind(this));

        this._setSelectedActors();
        this._setActiveLoreSkills();
    }

    _setSelectedActors() {
        this.selected_actors = this.element.find(".lmrtfy-actor input:checkbox:checked").toArray().map(a => this.actors[a.name.slice(6)]);
    }

    _setActiveLoreSkills() {
        const lore_skills = this.element.find(".lmrtfy-lore-skill input").toArray();

        for (let skill of lore_skills) {
            skill.disabled = !this.selected_actors.find(actor => actor.skills[skill.dataset.id]);

            if (skill.disabled) skill.checked = this.selected?.skills?.includes(skill.dataset.id) ?? false;
        }
    }

    _setActorSelection(event, enabled) {
        event.preventDefault();
        this.element.find(".lmrtfy-actor input").prop("checked", enabled);

        this._setSelectedActors();
        this._setActiveLoreSkills();
    }

    _onClickActor(event) {
        this._setSelectedActors();
        this._setActiveLoreSkills();
    }

    _buildAbilityTooltip(get_modifier) {
        const table = document.createElement("TABLE");

        for (const actor of this.selected_actors) {
            const modifier = get_modifier(actor);

            // for lore skills
            if (!modifier) continue;

            const {rank, mod} = LMRTFY.getModifierBreakdown(modifier);

            const row = document.createElement("TR");

            let col = document.createElement("TD");
            col.textContent = actor.name;
            row.appendChild(col);

            col = document.createElement("TD");
            col.textContent = rank;
            row.appendChild(col);

            col = document.createElement("TD");
            col.textContent = mod;
            row.appendChild(col);

            table.appendChild(row);
        }

        const tooltip = document.createElement("DIV");

        tooltip.classList.add("tooltip");

        tooltip.appendChild(table);

        return tooltip;
    }
    
    _onHoverAbility(event) {
        event.preventDefault();
        const div = event.currentTarget;

        // Remove any existing tooltip
        const tooltip = div.querySelector(".tooltip");
        if (tooltip) div.removeChild(tooltip);

        if (this.selected_actors.length == 0) return;

        // Handle hover-in
        if (event.type === "mouseenter") {
            const input = div.querySelector("input");

            if (input.disabled) return;

            let tooltip;

            switch (input.name.slice(0,5)) {
                case "check":
                    tooltip = this._buildAbilityTooltip((actor) => { return LMRTFY.buildAbilityModifier(actor, input.dataset.id); });
                    break;
                case "skill":
                    tooltip = this._buildAbilityTooltip((actor) => { return actor.skills[input.dataset.id]; });
                    break;
                case "save-":
                    tooltip = this._buildAbilityTooltip((actor) => { return actor.saves[input.dataset.id]; });
                    break;
                case "extra":
                    switch (input.name) {
                        case "extra-initiative":
                            tooltip = this._buildAbilityTooltip((actor) => { return actor.attributes.initiative; });
                            break;
                        case "extra-perception":
                            tooltip = this._buildAbilityTooltip((actor) => { return actor.attributes.perception; });
                            break;
                        default: 
                            return;
                    }
                    break;
                default: 
                    return;
            }

            div.appendChild(tooltip);

            const window_box = this.element.find(".lmrtfy .window-content").prevObject.get(0).getBoundingClientRect();
            const div_box = div.getBoundingClientRect();
            const tooltip_box = tooltip.getBoundingClientRect();

            // calculate top relative to bottom of div-element
            let new_top = (div_box.bottom - window_box.top) + 5;

            // but check if we are over the bottom edge of the window
            const new_bottom = window_box.top + new_top + tooltip_box.height;
            let overflow = new_bottom - window_box.bottom;

            // if so move the tooltip over the current div
            if (overflow > 0) {
                new_top = (div_box.top - window_box.top) - tooltip_box.height - 5;
            }

            // center tooltip to the middle of the div
            let new_left = (div_box.left - window_box.left) - (tooltip_box.width / 2 - div_box.width / 2);

            // but check if we are over the ride edge of the window
            const new_right = window_box.left + new_left + tooltip_box.width;
            overflow = new_right - window_box.right;

            // if so move the tooltip left by the overflow + 1
            if (overflow > 0) {
                new_left -= overflow + 1;
            }

            tooltip.style.top = `${new_top}px`;
            tooltip.style.left = `${new_left}px`;
        }
    }

    // From _onHoverMacro
    _onHoverActor(event) {
        event.preventDefault();
        const div = event.currentTarget;

        // Remove any existing tooltip
        const tooltip = div.querySelector(".tooltip");
        if (tooltip) div.removeChild(tooltip);

        // Handle hover-in
        if (event.type === "mouseenter") {
            const actorId = div.dataset.id;
            const actor = this.actors[actorId];
            if (!actor) return;
            const user = game.users.find(u => u.character && u.character._id === actor._id);
            const tooltip = document.createElement("SPAN");
            tooltip.classList.add("tooltip");
            tooltip.textContent = `${actor.name}${user ? ` (${user.name})` : ''}`;
            div.appendChild(tooltip);
        }
    }

    initializeData() {
        this.selected = {
            extraRollNotes: []
        };
        this.selected_actors = [];
    }

    close(...args) {
        this.initializeData();
        return super.close(...args);
    }

    parseFormData(formData) {
        const keys = Object.keys(formData);
        const actors = keys.filter(k => formData[k] && k.startsWith("actor-")).map(k => k.slice(6));
        const abilities = keys.filter(k => formData[k] && k.startsWith("check-")).map(k => k.slice(6));
        const saves = keys.filter(k => formData[k] && k.startsWith("save-")).map(k => k.slice(5));
        const skills = keys.filter(k => formData[k] && k.startsWith("skill-")).map(k => k.slice(6));
        const formula = formData.formula ? formData.formula.trim() : undefined;
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
            abilities,
            saves,
            skills,
            mode,
            title,
            message,
            formula,
            deathsave: formData['extra-death-save'],
            initiative: formData['extra-initiative'],
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
             (!socketData.message && socketData.abilities.length === 0 && socketData.saves.length === 0 && socketData.skills.length === 0 &&
                (!socketData.formula || socketData.formula.length === 0) && !socketData.deathsave && !socketData.initiative && !socketData.perception && !socketData['flat-check'])) {
            ui.notifications.warn(game.i18n.localize("LMRTFY.NothingNotification"));
            return;
        }
        
        // console.log("LMRTFY socket send : ", socketData)
        if (saveAsMacro) {

            const actorTargets = socketData.actors.map(a => this.actors[a]).filter(a => a).map(a => a.name).join(", ");
            const scriptContent = `// ${socketData.title} ${socketData.message ? " -- " + socketData.message : ""}\n` +
                `// Request rolls from ${actorTargets}\n` +
                `// Abilities: ${socketData.abilities.map(a => LMRTFY.abilities[a]).filter(s => s).join(", ")}\n` +
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
