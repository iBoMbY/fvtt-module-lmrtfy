

class LMRTFYRequestor extends FormApplication {
    constructor(...args) {
        super(...args);
        
        game.users.apps.push(this);

        this.actors = {};

        game.users.entities.filter(user => user.character && user.character.id).forEach((user) => {
            this.actors[user.character.id] = user.character;
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
        const users = game.users.entities;
        // Note: Maybe these work better at a global level, but keeping things simple
        const abilities = LMRTFY.abilities;
        const saves = LMRTFY.saves;

        const skills = Object.keys(LMRTFY.skills)
            .sort((a, b) => game.i18n.localize(LMRTFY.skills[a]).localeCompare(game.i18n.localize(LMRTFY.skills[b])))
            .reduce((acc, skillKey) => {
                acc[skillKey] = LMRTFY.skills[skillKey];
                return acc;
            }, {});

        const lore_skills = {};

        actors.forEach(actor => {
            const a_skills = actor.data.data.skills;
            (Object.keys(a_skills).map(key => a_skills[key]).filter(skill => skill.lore)).map(skill => lore_skills[skill.shortform] = skill.name);
        });

        return {
            actors,
            users,
            abilities,
            saves,
            skills,
            lore_skills,
            specialRolls: LMRTFY.specialRolls,
            rollModes: CONFIG.Dice.rollModes,
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
        this.element.find(".select-all").click((event) => this._setActorSelection(event, true));
        this.element.find(".deselect-all").click((event) => this._setActorSelection(event, false));
        this.element.find(".lmrtfy-save-roll").click(this._onSubmit.bind(this));
        this.element.find(".lmrtfy-extra-initiative").hover(this._onHoverAbility.bind(this));
        this.element.find(".lmrtfy-extra-perception").hover(this._onHoverAbility.bind(this));
        this.element.find(".lmrtfy-ability").hover(this._onHoverAbility.bind(this));
        this.element.find(".lmrtfy-skill").hover(this._onHoverAbility.bind(this));
        this.element.find(".lmrtfy-lore-skill").hover(this._onHoverAbility.bind(this));
        const actors = this.element.find(".lmrtfy-actor");
        actors.hover(this._onHoverActor.bind(this));
        actors.click(this._onClickActor.bind(this));

        this._setActiveLoreSkills();
    }

    _getSelectedActors() {
        return this.element.find(".lmrtfy-actor input:checkbox:checked").toArray().map(a => this.actors[a.name.slice(6)]);
    }

    _setActiveLoreSkills() {
        const selected_actors = this._getSelectedActors();
        
        const lore_skills = this.element.find(".lmrtfy-lore-skill input").toArray();

        for (let skill of lore_skills) {
            skill.disabled = !selected_actors.find(actor => actor.data.data.skills[skill.dataset.id]);

            if (skill.disabled) skill.checked = false;
        }
    }

    _setActorSelection(event, enabled) {
        event.preventDefault();
        this.element.find(".lmrtfy-actor input").prop("checked", enabled)
        this._setActiveLoreSkills();
    }

    _onClickActor(event) {
        this._setActiveLoreSkills();
    }

    _buildAbilityTooltip(get_modifier) {
        const table = document.createElement("TABLE");

        const actors = Object.keys(this.actors);

        for (const actor_id of actors) {
            const actor = this.actors[actor_id];
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

        tooltip.appendChild(table);

        return tooltip;
    }
    
    _onHoverAbility(event) {
        event.preventDefault();
        const div = event.currentTarget;

        // Remove any existing tooltip
        const tooltip = div.querySelector(".tooltip");
        if (tooltip) div.removeChild(tooltip);

        // Handle hover-in
        if (event.type === "mouseenter") {
            const input = div.querySelector("input");

            let tooltip;

            switch (input.name.slice(0,5)) {
                case "check":
                    tooltip = this._buildAbilityTooltip((actor) => { return LMRTFY.buildAbilityModifier(actor, input.dataset.id); });
                    break;
                case "skill":
                    tooltip = this._buildAbilityTooltip((actor) => { return actor.data.data.skills[input.dataset.id]; });
                    break;
                case "save-":
                    tooltip = this._buildAbilityTooltip((actor) => { return actor.data.data.saves[input.dataset.id]; });
                    break;
                case "extra":
                    switch (input.name) {
                        case "extra-initiative":
                            tooltip = this._buildAbilityTooltip((actor) => { return actor.data.data.attributes.initiative; });
                            break;
                        case "extra-perception":
                            tooltip = this._buildAbilityTooltip((actor) => { return actor.data.data.attributes.perception; });
                            break;
                        default: 
                            return;
                    }
                    break;
                default: 
                    return;
            }

            tooltip.classList.add("tooltip");

            div.appendChild(tooltip);

            const window_box = this.element.find(".lmrtfy .window-content").prevObject.get(0).getBoundingClientRect();
            const div_box = div.getBoundingClientRect();
            const tooltip_box = tooltip.getBoundingClientRect();

            // calculate top relative to bottom of div-element
            const new_top = (div_box.bottom - window_box.top) + 5;

            // center tooltip to the middle of the div
            let new_left = (div_box.left - window_box.left) - (tooltip_box.width / 2 - div_box.width / 2);

            // but check if we are over the ride edge of the window
            const new_right = window_box.left + new_left + tooltip_box.width;
            const overflow = new_right - window_box.right;

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
            const user = game.users.entities.find(u => u.character && u.character._id === actor._id);
            const tooltip = document.createElement("SPAN");
            tooltip.classList.add("tooltip");
            tooltip.textContent = `${actor.name}${user ? ` (${user.name})` : ''}`;
            div.appendChild(tooltip);
        }
    }

    async _updateObject(event, formData) {
        //console.log("LMRTFY submit: ", formData)
        const saveAsMacro = $(event.currentTarget).hasClass("lmrtfy-save-roll")
        const keys = Object.keys(formData)
        const actors = keys.filter(k => formData[k] && k.startsWith("actor-")).map(k => k.slice(6));
        const abilities = keys.filter(k => formData[k] && k.startsWith("check-")).map(k => k.slice(6));
        const saves = keys.filter(k => formData[k] && k.startsWith("save-")).map(k => k.slice(5));
        const skills = keys.filter(k => formData[k] && k.startsWith("skill-")).map(k => k.slice(6));
        const formula = formData.formula.trim();
        const { mode, title, message } = formData;
        
        if (actors.length === 0 ||
             (!message && abilities.length === 0 && saves.length === 0 && skills.length === 0 &&
                formula.length === 0 && !formData['extra-death-save'] && !formData['extra-initiative'] && !formData['extra-perception'])) {
            ui.notifications.warn(game.i18n.localize("LMRTFY.NothingNotification"));
            return;
        }
        
        let dc = undefined;

        if (Number.isInteger(formData.dc)) {
            dc = {
                value: formData.dc,
                visibility: formData.visibility
            }
        }
        
        const socketData = {
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
            chooseOne: formData['choose-one'],
            dc,
        }
        // console.log("LMRTFY socket send : ", socketData)
        if (saveAsMacro) {

            const actorTargets = actors.map(a => this.actors[a]).filter(a => a).map(a => a.name).join(", ");
            const scriptContent = `// ${title} ${message ? " -- " + message : ""}\n` +
                `// Request rolls from ${actorTargets}\n` +
                `// Abilities: ${abilities.map(a => LMRTFY.abilities[a]).filter(s => s).join(", ")}\n` +
                `// Saves: ${saves.map(a => LMRTFY.saves[a]).filter(s => s).join(", ")}\n` +
                `// Skills: ${skills.map(s => LMRTFY.skills[s]).filter(s => s).join(", ")}\n` +
                `const data = ${JSON.stringify(socketData, null, 2)};\n\n` +
                `game.socket.emit('module.lmrtfy_pf2e', data);\n`;
            const macro = await Macro.create({
                name: "LMRTFY: " + (message || title),
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
