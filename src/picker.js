class LMRTFYPicker extends FormApplication {
    constructor(data) {
        super();
     
        game.users.apps.push(this);

        this.data = data;
        this.actors = {};

        game.users.filter(user => user.character && user.character.id).forEach((user) => {
            this.actors[user.character.id] = user.character;
        });
    }

    static get defaultOptions() {
        const options = super.defaultOptions;
        options.title = game.i18n.localize("LMRTFY.Title");
        options.template = "modules/lmrtfy_pf2e/templates/pick-chars.html";
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

        return {
            actors,
            data: this.data,
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

        const actors = this.element.find(".lmrtfy-actor");
        actors.hover(this._onHoverActor.bind(this));
    }

    _setActorSelection(event, enabled) {
        event.preventDefault();
        this.element.find(".lmrtfy-actor input").prop("checked", enabled);
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

    async _updateObject(event, formData) {
        const keys = Object.keys(formData)
        const actors = keys.filter(k => formData[k] && k.startsWith("actor-")).map(k => k.slice(6));
                
        if (actors.length === 0) {
            ui.notifications.warn(game.i18n.localize("LMRTFY.NothingNotification"));
            return;
        }
        
        this.data.actors = actors;

        game.socket.emit('module.lmrtfy_pf2e', this.data);

        // Send to ourselves
        LMRTFY.onMessage(this.data);
        ui.notifications.info(game.i18n.localize("LMRTFY.SentNotification"));

        this.close();
    }
}
