const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { GObject, St, Clutter } = imports.gi;

// icons and labels
const Lang = imports.lang;

// menu items
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu
const PopupMenu = imports.ui.popupMenu;
const { Slider, SLIDER_SCROLL_STEP } = imports.ui.slider;

const {
    brightnessLog
} = Me.imports.convenience;

// for settings
const Convenience = Me.imports.convenience;
settings = ExtensionUtils.getSettings();

function decycle(obj, stack = []) {
    if (!obj || typeof obj !== 'object')
        return obj;
    
    if (stack.includes(obj))
        return null;

    let s = stack.concat([obj]);

    return Array.isArray(obj)
        ? obj.map(x => decycle(x, s))
        : Object.fromEntries(
            Object.entries(obj)
                .map(([k, v]) => [k, decycle(v, s)]));
}


function valueSliderMoveEvent(actor, scroll_step){
    actor.getStoredValueSliders().forEach(valueSlider => {
        valueSlider.value = Math.min(Math.max(0, valueSlider.value + scroll_step), valueSlider._maxValue);
    });
}
function valueSliderScrollEvent(actor, event){
    actor.getStoredValueSliders().forEach(valueSlider => {
        valueSlider.emit('scroll-event', event);
    });
    return Clutter.EVENT_STOP;
}

var StatusAreaBrightnessMenu = GObject.registerClass({
    GType: 'StatusAreaBrightnessMenu',
    Signals: { 'value-up': {}, 'value-down': {} },
}, class StatusAreaBrightnessMenu extends PanelMenu.Button {
    _init() {
        this._valueSliders = [];
        super._init(0.0);
        let icon = new St.Icon({ icon_name: 'display-brightness-symbolic', style_class: 'system-status-icon' });
        this.add_actor(icon);
        this.connect('scroll-event', valueSliderScrollEvent);
        this.connect('value-up', (actor, event) => {
            valueSliderMoveEvent(actor, SLIDER_SCROLL_STEP)
            return Clutter.EVENT_STOP;
        });
        this.connect('value-down', (actor, event) => {
            valueSliderMoveEvent(actor, -SLIDER_SCROLL_STEP)
            return Clutter.EVENT_STOP;
        });
    }
    clearStoredValueSliders(){
        this._valueSliders = [];
    }
    storeValueSliderForEvents(slider){
        this._valueSliders.push(slider);
    }
    getStoredValueSliders(){
        return this._valueSliders;
    }
    removeAllMenu() {
        this.menu.removeAll();
    }
    addMenuItem(item, position = null) {
        this.menu.addMenuItem(item);
    }

});

var SystemMenuBrightnessMenu = GObject.registerClass({
    GType: 'SystemMenuBrightnessMenu',
    Signals: { 'value-up': {}, 'value-down': {} },
}, class SystemMenuBrightnessMenu extends PanelMenu.SystemIndicator {
    _init() {
        super._init();
        this._indicator = this._addIndicator();
        this._indicator.icon_name = 'display-brightness-symbolic';
        this._valueSliders = [];

        this.connect('scroll-event', valueSliderScrollEvent);
        this.connect('value-up', (actor, event) => {
            valueSliderMoveEvent(actor, SLIDER_SCROLL_STEP)
            return Clutter.EVENT_STOP;
        });
        this.connect('value-down', (actor, event) => {
            valueSliderMoveEvent(actor, -SLIDER_SCROLL_STEP)
            return Clutter.EVENT_STOP;
        });
        this.connect('destroy', this._onDestroy.bind(this)); 
    }
    removeAllMenu() {
        this.menu.removeAll()
    }
    addMenuItem(item, position = null) {
        this.menu.addMenuItem(item)
    }
    clearStoredValueSliders(){
        this._valueSliders = [];
    }
    storeValueSliderForEvents(slider){
        this._valueSliders.push(slider);
    }
    getStoredValueSliders(){
        return this._valueSliders;
    }
    _onDestroy() {
        this.menu.destroy();
    }
});

var SingleMonitorMenuItem = GObject.registerClass({
    GType: 'SingleMonitorMenuItem'
}, class SingleMonitorMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(icon, name, slider, label) {
        super._init();
        if (icon != null) {
            this.add_actor(icon);
        }
        if(name != null && settings.get_boolean('show-display-name')){
            this.add_child(name);
        }
        this.add_child(slider);

        if (settings.get_boolean('show-value-label')) {
            this.add_child(label);
        }
    }
});

var SingleMonitorSliderAndValue = class SingleMonitorSliderAndValue extends PopupMenu.PopupMenuSection {
    constructor(displayName, currentValue, onSliderChange) {
        super();
        this._timer = null
        this._displayName = displayName
        this._currentValue = currentValue
        this._onSliderChange = onSliderChange
        this._init();
    }
    _init() {
        this.NameContainer = new PopupMenu.PopupMenuItem(this._displayName, { hover: false, reactive: false, can_focus: false });

        this.ValueSlider = new Slider(this._currentValue);
        this.ValueSlider.connect('notify::value', Lang.bind(this, this._SliderChange));

        this.ValueLabel = new St.Label({ text: this._SliderValueToBrightness(this._currentValue).toString() });

        this.NameContainer = new PopupMenu.PopupMenuItem(this._displayName, { hover: false, reactive: false, can_focus: false });
        if (settings.get_string('button-location') == "panel") {
            this.SliderContainer = new SingleMonitorMenuItem(null, null, this.ValueSlider, this.ValueLabel);
            if(settings.get_boolean('show-display-name')){
                this.addMenuItem(this.NameContainer);
            }
        } else {
            let icon = new St.Icon({ icon_name: 'display-brightness-symbolic', style_class: 'popup-menu-icon' });
            this.SliderContainer = new SingleMonitorMenuItem(icon, this.NameContainer, this.ValueSlider, this.ValueLabel);
        }
        this.addMenuItem(this.SliderContainer);
        if (settings.get_string('button-location') == "panel") {
            this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }
    changeValue(newValue) {
        this.ValueSlider.value = newValue / 100;
    }
    getValueSlider() {
        return this.ValueSlider;
    }
    _SliderValueToBrightness(sliderValue) {
        return Math.floor(sliderValue * 100);
    }
    _SliderChange() {
        let sliderItem = this
        if (sliderItem.timer) {
            Convenience.clearTimeout(sliderItem.timer);
        }
        let brightness = this._SliderValueToBrightness(sliderItem.ValueSlider.value);
        sliderItem.ValueLabel.text = brightness.toString();
        sliderItem.timer = Convenience.setTimeout(() => {
            sliderItem.timer = null;
            sliderItem._onSliderChange(brightness)
        }, 500)
    }
}
