//export XDG_CURRENT_DESKTOP=Unity
var logger = require('electron-log');
logger.info("init........");
const { app } = require('electron');
const path = require('path');
var Datastore = require('nedb');
const fs = require('fs');
const DB_DIR = path.join(getUserHome(), ".clipit");
try {
    fs.accessSync(DB_DIR);
} catch (err) {
    fs.mkdirSync(DB_DIR);
}

let db = new Datastore({ filename: path.join(DB_DIR, '.clipboarddb'), autoload: true });
let prefDb = new Datastore({ filename: path.join(DB_DIR, '.clipboarddbpref'), autoload: true });
db.ensureIndex({ fieldName: 'id', unique: true }, function () {
});
prefDb.ensureIndex({fieldName: 'type', unique: true }, function () {
});
function getUserHome() {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

var md5 = require('md5');
var AutoLaunch = require('auto-launch');

var clipit = new AutoLaunch({
    name: 'clipit'
});

clipit.enable();

const { Menu, Tray, clipboard } = require('electron');

let tray = null;

function clearHistory() {
    db.remove({}, { multi: true }, function (err, numRemoved) {
        logger.debug("clear cliked", err, numRemoved);
        createTray();
    });
}

let clipbiard_limit = 10;

prefDb.find({type: "settings"}).exec(function(e, r){
    if(e) return logger.debug(e);
    if(r.length > 0){
        clipbiard_limit = r[0].limit;
        createTray();
    }
});

function limit(value){
    clipbiard_limit= value.value;
    upsert(prefDb, {type: "settings", limit: value.value}, {type: "settings"});
}

function createTray(params) {
    if (!params) params = {};
    try {
        db.find({}).sort({ date: -1 }).limit(clipbiard_limit).exec(function (err, r) {
            if(err) return logger.info("Innodb find err", err);
            logger.info("createTray", r);
          // docs is [doc3, doc1]
            let trayItems = [
                { label: 'Quit', click: app.quit, enabled: params.disabled ? false : true },
                { label: 'Clear', click: clearHistory, enabled: params.disabled ? false : true },
            ];
            if(!params.disabled){
                trayItems.push({label: "Clipboard Limit",submenu: [{label: '10',
                    value: 10,
                    click: limit,
                    type: "radio",
                    checked: clipbiard_limit == 10?true:false
                },{
                    label: '30',
                    value: 30,
                    click: limit,
                    type: "radio",
                    checked: clipbiard_limit == 30?true:false
                },{
                    label: 'unlimited',
                    value: 300,
                    click: limit,
                    type: "radio",
                    checked: clipbiard_limit == 300?true:false

                }
                ]});
                trayItems.push({
                    label: '___________________________________________________',
                    enabled: false
                });
            }
            if (r.length === 0) {
                trayItems.push({ label: 'clipboard is empty', enabled: false });
            }
            for (let item of r) {
                if (item.text) {
                    trayItems.push({
                        label: item.text.slice(0, 50),
                        value: item.text,
                        click: function(r) {
                            clipboard.writeText(r.value);
                        }
                    });
                }
            }
            if (tray && !tray.isDestroyed()) {
                tray.destroy();
            }
            tray = new Tray(path.join(__dirname, 'images/16x16.png'));
            const contextMenu = Menu.buildFromTemplate(trayItems);
            tray.setToolTip('This is my application.');
            tray.setContextMenu(contextMenu);
            tray.setTitle("clipit");
            // tray.on('click', () => {
            //     logger.info('tray click');
            //     createTray();
            // });
            setTimeout(()=>{
                if (params.popup) tray.popUpContextMenu();
            }, 300);
        });
    } catch (exc) {
        logger.error(exc);
    }
}

const { globalShortcut } = require('electron');

app.on('ready', () => {
    globalShortcut.register('CommandOrControl+Alt+h', () => {
        createTray({
            disabled: true,
            popup: true
        });
    });
    clipboardWatch();
});


function upsert(db, values, condition) {
    db.findOne(condition, function (err, obj) {
        // doc is the document Mars
        // If no document is found, doc is null
        if (obj) { // update
            values.date = new Date();
            db.update(condition, values, function (err, numReplaced) {
                logger.error(err, numReplaced);
                createTray();
            });
        } else {
            db.insert(values,function (err, numReplaced) {
                logger.error(err, numReplaced);
                createTray();
            });
        }
    });
}

function clipboardWatch() {
    let cur_clipboard = clipboard.readText();
    createTray();
    setInterval(() => {
        let new_clip = clipboard.readText();
        if (cur_clipboard !== new_clip) {
            cur_clipboard = new_clip;
            let doc = {
                id: md5(cur_clipboard),
                "text": cur_clipboard,
                date: new Date()
            };
            upsert(db, doc, {id: doc.id});
        }
    }, 500);
}

if(process.platform == "darwin") app.dock.hide();
// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
