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
function launchEmulator(apiLevel, target, arch, profile, cores, ramSize, heapSize, sdcardPathOrSize, diskSize, avdName, forceAvdCreation, emulatorBootTimeout, port, emulatorOptions, disableAnimations, disableSpellChecker, disableLinuxHardwareAcceleration, enableHardwareKeyboard, disableImmersiveModeConfirmation, disableStylusHandwriting, apk) {
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
                yield exec.exec(`sh -c \\"printf 'hw.ramSize=${ramSize}\n' >> ${process.env.ANDROID_AVD_HOME}/"${avdName}".avd"/config.ini`);
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
            // start emulator
            console.log('Starting emulator.');
            yield exec.exec(`sh -c \\"${process.env.ANDROID_HOME}/emulator/emulator -port ${port} -avd "${avdName}" ${emulatorOptions} &"`, [], {
                listeners: {
                    stderr: (data) => {
                        if (data.toString().includes('invalid command-line parameter')) {
                            throw new Error(data.toString());
                        }
                    },
                },
            });
            // wait for emulator to complete booting
            const localeMatch = emulatorOptions.match(/-change-locale ([a-z]{2}-[A-Z]{2})/);
            const locale = localeMatch === null ? undefined : localeMatch[1];
            yield waitForDevice(parseInt(apiLevel, 10), port, emulatorBootTimeout, locale);
            yield adb(port, `shell input keyevent 82`);
            if (disableAnimations) {
                console.log('Disabling animations.');
                yield adb(port, `shell settings put global window_animation_scale 0.0`);
                yield adb(port, `shell settings put global transition_animation_scale 0.0`);
                yield adb(port, `shell settings put global animator_duration_scale 0.0`);
            }
            if (disableSpellChecker) {
                yield adb(port, `shell settings put secure spell_checker_enabled 0`);
            }
            if (enableHardwareKeyboard) {
                yield adb(port, `shell settings put secure show_ime_with_hard_keyboard 0`);
            }
            if (disableImmersiveModeConfirmation) {
                yield adb(port, `shell settings put secure immersive_mode_confirmations confirmed`);
            }
            if (disableStylusHandwriting) {
                yield adb(port, `shell settings put global stylus_handwriting_enabled 0`);
            }
            if (apk.length > 0) {
                yield adb(port, `install ${apk}`);
            }
        }
        finally {
            console.log(`::endgroup::`);
        }
    });
}
exports.launchEmulator = launchEmulator;
/**
 * Kills the running emulator on the default port.
 */
function killEmulator(port) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`::group::Terminate Emulator`);
            yield adb(port, `emu kill`);
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
function adb(port, command) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield exec.exec(`adb -s emulator-${port} ${command}`);
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
        let localeChanged = locale === undefined;
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
        if (locale) {
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
            attempts = 0;
            maxAttempts = 10;
            let broadcasts = '0';
            yield exec.exec(`/bin/bash -c "adb -s emulator-${port} logcat -d | grep 'Sending CONNECTED broadcast for type 1' | wc -l | tr -d ' '"`, [], {
                listeners: {
                    stdout: (data) => {
                        broadcasts = data.toString();
                    },
                },
            });
            while (!localeChanged) {
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
                        localeChanged = true;
                        yield delay(retryInterval * 1000);
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
        }
    });
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
