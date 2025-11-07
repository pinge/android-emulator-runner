"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAvd = exports.killEmulator = exports.launchEmulator = void 0;
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
/**
 * Creates and launches a new AVD instance with the specified configurations.
 */
function launchEmulator(apiLevel, target, arch, profile, cores, ramSize, heapSize, sdcardPathOrSize, diskSize, avdName, forceAvdCreation, emulatorBootTimeout, port, emulatorOptions, disableAnimations, disableSpellChecker, disableLinuxHardwareAcceleration, enableHardwareKeyboard, disableImmersiveModeConfirmation, disableStylusHandwriting, apk, locale, adbPath, waitForNetwork) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`::group::Launch Emulator`);
            // create a new AVD if AVD directory does not already exist or forceAvdCreation is true
            const avdPath = `${process.env.ANDROID_AVD_HOME}/${avdName}.avd`;
            if (!fs.existsSync(avdPath) || forceAvdCreation) {
                const profileOption = profile.trim() !== '' ? `--device '${profile}'` : '';
                const sdcardPathOrSizeOption = sdcardPathOrSize.trim() !== '' ? `--sdcard '${sdcardPathOrSize}'` : '';
                console.log(`Creating AVD.`);
                yield exec.exec(`sh -c \\"echo no | avdmanager create avd --force -n "${avdName}" --abi '${target}/${arch}' --package 'system-images;android-${apiLevel};${target};${arch}' ${profileOption} ${sdcardPathOrSizeOption}"`);
            }
            if (cores) {
                yield exec.exec(`sh -c \\"printf 'hw.cpu.ncore=${cores}\n' >> ${process.env.ANDROID_AVD_HOME}/"${avdName}".avd"/config.ini`);
            }
            if (ramSize) {
                console.log(`Setting memory size to ${ramSize}MB.`);
                emulatorOptions += ` -memory ${ramSize}`;
            }
            if (heapSize) {
                yield exec.exec(`sh -c \\"printf 'hw.heapSize=${heapSize}\n' >> ${process.env.ANDROID_AVD_HOME}/"${avdName}".avd"/config.ini`);
            }
            if (enableHardwareKeyboard) {
                yield exec.exec(`sh -c \\"printf 'hw.keyboard=yes\n' >> ${process.env.ANDROID_AVD_HOME}/"${avdName}".avd"/config.ini`);
            }
            if (diskSize) {
                yield exec.exec(`sh -c \\"printf 'disk.dataPartition.size=${diskSize}\n' >> ${process.env.ANDROID_AVD_HOME}/"${avdName}".avd"/config.ini`);
            }
            // turn off hardware acceleration on Linux
            if (process.platform === 'linux' && disableLinuxHardwareAcceleration) {
                console.log('Disabling Linux hardware acceleration.');
                emulatorOptions += ' -accel off';
            }
            if (locale.length > 0) {
                if (!emulatorOptions.match(/-change-locale ([a-z]{2}-[A-Z]{2})/)) {
                    emulatorOptions += ` -change-locale ${locale}`;
                }
            }
            if (adbPath.length > 0) {
                emulatorOptions += ` -no-direct-adb -adb-path ${adbPath}`;
            }
            // start emulator
            console.log('Starting emulator with the following options:');
            console.log(emulatorOptions);
            yield exec.exec(`sh -c \\"${process.env.ANDROID_HOME}/emulator/emulator -port ${port} -avd "${avdName}" ${emulatorOptions} &"`, [], {
                listeners: {
                    stderr: (data) => {
                        if (data.toString().includes('invalid command-line parameter')) {
                            throw new Error(data.toString());
                        }
                    },
                },
            });
            // TODO add timeout, adb wait-for-device will wait forever if emulator is killed
            yield adb(port, 'wait-for-device shell "while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done;"');
            if (locale.length > 0) {
                // TODO add timeout, adb wait-for-device will wait forever if emulator is killed
                yield adb(port, `wait-for-device shell "while [[ $(getprop persist.sys.locale) != \'${locale}\' ]]; do sleep 1; done;"`);
                // await waitForLocale(port, emulatorBootTimeout, locale);
            }
            if (waitForNetwork) {
                yield untilNetworkIsReady(port);
                // await waitForNetworkReady(parseInt(apiLevel, 10), port, emulatorBootTimeout);
            }
            // wait for emulator to complete booting
            // const localeMatch = emulatorOptions.match(/-change-locale ([a-z]{2}-[A-Z]{2})/)
            // const locale = localeMatch === null ? undefined : localeMatch[1]
            // await waitForDevice(parseInt(apiLevel, 10), port, emulatorBootTimeout, locale);
            yield adb(port, 'wait-for-device shell "input keyevent 82"');
            console.log(`::endgroup::`);
            console.log(`::group::Post Launch`);
            if (disableAnimations) {
                console.log('Disabling animations.');
                yield adb(port, `shell settings put global window_animation_scale 0.0`);
                yield adb(port, `shell settings put global transition_animation_scale 0.0`);
                yield adb(port, `shell settings put global animator_duration_scale 0.0`);
            }
            if (disableSpellChecker) {
                console.log('Disabling spell checker.');
                yield adb(port, `shell settings put secure spell_checker_enabled 0`);
            }
            if (enableHardwareKeyboard) {
                console.log('Enabling hardware keyboard.');
                yield adb(port, `shell settings put secure show_ime_with_hard_keyboard 0`);
            }
            if (disableImmersiveModeConfirmation) {
                console.log('Disabling immersive mode confirmation.');
                yield adb(port, `shell settings put secure immersive_mode_confirmations confirmed`);
            }
            if (disableStylusHandwriting) {
                console.log('Disabling stylus handwriting.');
                yield adb(port, `shell settings put global stylus_handwriting_enabled 0`);
            }
            if (apk.length > 0) {
                console.log(`::endgroup::`);
                console.log(`::group::Install App`);
                yield adb(port, 'wait-for-device');
                yield adb(port, `install ${apk}`);
            }
        }
        finally {
            console.log(`::endgroup::`);
            yield adb(port, 'wait-for-device');
        }
    });
}
exports.launchEmulator = launchEmulator;
function untilNetworkIsReady(port) {
    return __awaiter(this, void 0, void 0, function* () {
        // since this function is called right after the dhcp client gets a lease, wait a couple of seconds for networkg
        // rounting to settle otherwise the adb ping will almost always retry at least once.
        yield new Promise((resolve) => setTimeout(resolve, 2000));
        // TODO add timeout, adb wait-for-device will wait forever if emulator is killed
        yield adb(port, `wait-for-device shell "while [[ -z $(ifconfig | grep -A 1 -E \'^(eth0|wlan0)\' | grep \'inet addr\' | sed -E \'s/.*inet addr:([0-9.]+).*/\\1/\') ]]; do sleep 1; done;"`);
        yield adb(port, 'wait-for-device shell "ping -i 1 -c 3 -w 3 8.8.8.8"');
    });
}
/**
 * Kills the running emulator on the default port.
 */
function killEmulator(port) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`::group::Terminate Emulator`);
            yield adb(port, 'wait-for-device emu kill');
            yield new Promise((resolve) => setTimeout(resolve, 5000));
        }
        catch (error) {
            console.log(error instanceof Error ? error.message : error);
        }
        finally {
            console.log(`::endgroup::`);
        }
    });
}
exports.killEmulator = killEmulator;
/*

  handle adb errors like the one below by retrying with an exponential fallback

  adb: failed to install /Users/a-runner/actions-runner/_work/athlete/athlete/android/app/6.96.0-development-20251106015116-universal.apk: cmd: Failure calling service package: Broken pipe (32)
  Error: The process '/Users/a-runner/.android/sdk/platform-tools/adb' failed with exit code 1
      at ExecState._setResult (/Users/a-runner/actions-runner/_work/_actions/pinge/android-emulator-runner/eda3ac4c8af1ca313a52e3e3016f5ee923e4238e/node_modules/@actions/exec/lib/toolrunner.js:592:25)
      at ExecState.CheckComplete (/Users/a-runner/actions-runner/_work/_actions/pinge/android-emulator-runner/eda3ac4c8af1ca313a52e3e3016f5ee923e4238e/node_modules/@actions/exec/lib/toolrunner.js:575:18)
      at ChildProcess.<anonymous> (/Users/a-runner/actions-runner/_work/_actions/pinge/android-emulator-runner/eda3ac4c8af1ca313a52e3e3016f5ee923e4238e/node_modules/@actions/exec/lib/toolrunner.js:469:27)
      at ChildProcess.emit (node:events:524:28)
      at maybeClose (node:internal/child_process:1104:16)
      at Socket.<anonymous> (node:internal/child_process:456:11)
      at Socket.emit (node:events:524:28)
      at Pipe.<anonymous> (node:net:343:12)

*/
function adb(port, command, retries = 3, interval = 2) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return yield exec.exec(`adb -s emulator-${port} ${command}`);
            }
            catch (error) {
                if (attempt === retries) {
                    throw error;
                }
                console.log(`adb retry: ${attempt + 1}/${retries}`);
                yield new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(interval, attempt + 1)));
            }
        }
        throw new Error('adb: retry exited unexpectedly');
    });
}
/**
 * Wait for emulator to change locale.
 */
function waitForLocale(port, emulatorBootTimeout, locale) {
    return __awaiter(this, void 0, void 0, function* () {
        let localeChanged = locale === '';
        let attempts = 0;
        const retryInterval = 2; // retry every 2 seconds
        let maxAttempts = emulatorBootTimeout / 2;
        if (locale.length > 0) {
            while (!localeChanged) {
                try {
                    let result = '';
                    yield exec.exec(`adb -s emulator-${port} shell getprop persist.sys.locale`, [], {
                        listeners: {
                            stdout: (data) => {
                                result += data.toString();
                            },
                        },
                    });
                    if (result.trim() === locale) {
                        console.log('Emulator locale changed.');
                        break;
                    }
                }
                catch (error) {
                    console.warn(error instanceof Error ? error.message : error);
                }
                if (attempts < maxAttempts) {
                    yield delay(retryInterval * 1000);
                }
                else {
                    throw new Error(`Timeout waiting for emulator to change locale.`);
                }
                attempts++;
            }
        }
    });
}
/**
 * Wait for emulator network to initialize.
 */
function waitForNetworkReady(apiLevel, port, emulatorBootTimeout) {
    return __awaiter(this, void 0, void 0, function* () {
        let attempts = 0;
        const retryInterval = 2; // retry every 2 seconds
        let maxAttempts = emulatorBootTimeout / 2;
        attempts = 0;
        maxAttempts = 10;
        let broadcasts = '0';
        let networkReady = false;
        yield exec.exec(`/bin/bash -c "adb -s emulator-${port} logcat -d | grep 'Sending CONNECTED broadcast for type 1' | wc -l | tr -d ' '"`, [], {
            listeners: {
                stdout: (data) => {
                    broadcasts = data.toString();
                },
            },
        });
        while (!networkReady) {
            try {
                let result = '';
                yield exec.exec(`/bin/bash -c "adb -s emulator-${port} logcat -d | grep 'Sending CONNECTED broadcast for type ${apiLevel === 35 ? '' : '1'}' | wc -l | tr -d ' '"`, [], {
                    listeners: {
                        stdout: (data) => {
                            result += data.toString();
                        },
                    },
                });
                if (parseInt(result.trim(), 10) > parseInt(broadcasts, 10)) {
                    console.log('Emulator network ready.');
                    networkReady = true;
                    // await delay(retryInterval * 1000);
                    break;
                }
            }
            catch (error) {
                console.warn(error instanceof Error ? error.message : error);
            }
            if (attempts < maxAttempts) {
                yield delay(retryInterval * 1000);
            }
            else {
                throw new Error(`Timeout waiting for emulator network to be ready.`);
            }
            attempts++;
        }
        // using adb wait-for-device after the network is ready seems to decrease flakiness
        yield adb(port, 'wait-for-device');
    });
}
/**
 * Deletes the specified AVD.
 */
function deleteAvd(avdName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`::group::Delete AVD`);
            console.log(`Deleting AVD '${avdName}'.`);
            yield exec.exec(`avdmanager delete avd -n "${avdName}"`);
            console.log(`AVD '${avdName}' deleted successfully.`);
        }
        catch (error) {
            console.log(`Failed to delete AVD '${avdName}': ${error instanceof Error ? error.message : error}`);
        }
        finally {
            console.log(`::endgroup::`);
        }
    });
}
exports.deleteAvd = deleteAvd;
/**
 * Wait for emulator to boot.
 */
function waitForDevice(apiLevel, port, emulatorBootTimeout, locale) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`waitForDevice() apiLevel: '${apiLevel}'`);
        let booted = false;
        let localeChanged = locale === '';
        let attempts = 0;
        const retryInterval = 2; // retry every 2 seconds
        let maxAttempts = emulatorBootTimeout / 2;
        while (!booted) {
            try {
                let result = '';
                yield exec.exec(`adb -s emulator-${port} shell getprop sys.boot_completed`, [], {
                    listeners: {
                        stdout: (data) => {
                            result += data.toString();
                        },
                    },
                });
                if (result.trim() === '1') {
                    console.log('Emulator booted.');
                    booted = true;
                    break;
                }
            }
            catch (error) {
                console.warn(error instanceof Error ? error.message : error);
            }
            if (attempts < maxAttempts) {
                yield delay(retryInterval * 1000);
            }
            else {
                throw new Error(`Timeout waiting for emulator to boot.`);
            }
            attempts++;
        }
        attempts = 0;
        if (locale.length > 0) {
            while (!localeChanged) {
                try {
                    let result = '';
                    yield exec.exec(`adb -s emulator-${port} shell getprop persist.sys.locale`, [], {
                        listeners: {
                            stdout: (data) => {
                                result += data.toString();
                            },
                        },
                    });
                    if (result.trim() === locale) {
                        console.log('Emulator locale changed.');
                        break;
                    }
                }
                catch (error) {
                    console.warn(error instanceof Error ? error.message : error);
                }
                if (attempts < maxAttempts) {
                    yield delay(retryInterval * 1000);
                }
                else {
                    throw new Error(`Timeout waiting for emulator to change locale.`);
                }
                attempts++;
            }
        }
        attempts = 0;
        maxAttempts = 10;
        let broadcasts = '0';
        let networkReady = false;
        yield exec.exec(`/bin/bash -c "adb -s emulator-${port} logcat -d | grep 'Sending CONNECTED broadcast for type 1' | wc -l | tr -d ' '"`, [], {
            listeners: {
                stdout: (data) => {
                    broadcasts = data.toString();
                },
            },
        });
        while (!networkReady) {
            try {
                let result = '';
                yield exec.exec(`/bin/bash -c "adb -s emulator-${port} logcat -d | grep 'Sending CONNECTED broadcast for type ${apiLevel === 35 ? '' : '1'}' | wc -l | tr -d ' '"`, [], {
                    listeners: {
                        stdout: (data) => {
                            result += data.toString();
                        },
                    },
                });
                if (parseInt(result.trim(), 10) > parseInt(broadcasts, 10)) {
                    console.log('Emulator network ready.');
                    networkReady = true;
                    // await delay(retryInterval * 1000);
                    break;
                }
            }
            catch (error) {
                console.warn(error instanceof Error ? error.message : error);
            }
            if (attempts < maxAttempts) {
                yield delay(retryInterval * 1000);
            }
            else {
                throw new Error(`Timeout waiting for emulator network to be ready.`);
            }
            attempts++;
        }
        yield adb(port, 'wait-for-device');
    });
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
