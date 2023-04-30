class LMRTFYPicker extends FormApplication {
    constructor(data) {
        super();
     
        game.users.apps.push(this);

        this.data = data;
        this.actors = {};
        this.selected = {
            actors: [],
        };

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

    activateListeners(html) {
        super.activateListeners(html);

        $(".chosen-select").chosen();

        this.element.find(".lmrtfy-select-all").click((event) => this._setActorSelection(event, true));
    }

    _setActorSelection(event, enabled) {
        event.preventDefault();
        this.selected.actors = Object.keys(this.actors);
        this.render(true);
    }

    close(...args) {
        this.invalid = true;
        return super.close(...args);
    }    

    async _updateObject(event, formData) {
        const actors = formData.actors ?? [];
                
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
