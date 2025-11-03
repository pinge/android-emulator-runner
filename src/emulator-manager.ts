import * as exec from '@actions/exec';
import * as fs from 'fs';

/**
 * Creates and launches a new AVD instance with the specified configurations.
 */
export async function launchEmulator(
  apiLevel: string,
  target: string,
  arch: string,
  profile: string,
  cores: string,
  ramSize: string,
  heapSize: string,
  sdcardPathOrSize: string,
  diskSize: string,
  avdName: string,
  forceAvdCreation: boolean,
  emulatorBootTimeout: number,
  port: number,
  emulatorOptions: string,
  disableAnimations: boolean,
  disableSpellChecker: boolean,
  disableLinuxHardwareAcceleration: boolean,
  enableHardwareKeyboard: boolean
): Promise<void> {
  try {
    console.log(`::group::Launch Emulator`);
    // create a new AVD if AVD directory does not already exist or forceAvdCreation is true
    const avdPath = `${process.env.ANDROID_AVD_HOME}/${avdName}.avd`;
    if (!fs.existsSync(avdPath) || forceAvdCreation) {
      const profileOption = profile.trim() !== '' ? `--device '${profile}'` : '';
      const sdcardPathOrSizeOption = sdcardPathOrSize.trim() !== '' ? `--sdcard '${sdcardPathOrSize}'` : '';
      console.log(`Creating AVD.`);
      await exec.exec(
        `sh -c \\"echo no | avdmanager create avd --force -n "${avdName}" --abi '${target}/${arch}' --package 'system-images;android-${apiLevel};${target};${arch}' ${profileOption} ${sdcardPathOrSizeOption}"`
      );
    }

    if (cores) {
      await exec.exec(`sh -c \\"printf 'hw.cpu.ncore=${cores}\n' >> ${process.env.ANDROID_AVD_HOME}/"${avdName}".avd"/config.ini`);
    }

    if (ramSize) {
      await exec.exec(`sh -c \\"printf 'hw.ramSize=${ramSize}\n' >> ${process.env.ANDROID_AVD_HOME}/"${avdName}".avd"/config.ini`);
    }

    if (heapSize) {
      await exec.exec(`sh -c \\"printf 'hw.heapSize=${heapSize}\n' >> ${process.env.ANDROID_AVD_HOME}/"${avdName}".avd"/config.ini`);
    }

    if (enableHardwareKeyboard) {
      await exec.exec(`sh -c \\"printf 'hw.keyboard=yes\n' >> ${process.env.ANDROID_AVD_HOME}/"${avdName}".avd"/config.ini`);
    }

    if (diskSize) {
      await exec.exec(`sh -c \\"printf 'disk.dataPartition.size=${diskSize}\n' >> ${process.env.ANDROID_AVD_HOME}/"${avdName}".avd"/config.ini`);
    }

    // turn off hardware acceleration on Linux
    if (process.platform === 'linux' && disableLinuxHardwareAcceleration) {
      console.log('Disabling Linux hardware acceleration.');
      emulatorOptions += ' -accel off';
    }

    // start emulator
    console.log('Starting emulator.');

    await exec.exec(`sh -c \\"${process.env.ANDROID_HOME}/emulator/emulator -port ${port} -avd "${avdName}" ${emulatorOptions} &"`, [], {
      listeners: {
        stderr: (data: Buffer) => {
          if (data.toString().includes('invalid command-line parameter')) {
            throw new Error(data.toString());
          }
        },
      },
    });

    // wait for emulator to complete booting
    const localeMatch = emulatorOptions.match(/-change-locale ([a-z]{2}-[A-Z]{2})/)
    const locale = localeMatch === null ? undefined : localeMatch[1]
    await waitForDevice(parseInt(apiLevel, 10), port, emulatorBootTimeout, locale);
    await adb(port, `shell input keyevent 82`);

    if (disableAnimations) {
      console.log('Disabling animations.');
      await adb(port, `shell settings put global window_animation_scale 0.0`);
      await adb(port, `shell settings put global transition_animation_scale 0.0`);
      await adb(port, `shell settings put global animator_duration_scale 0.0`);
    }
    if (disableSpellChecker) {
      await adb(port, `shell settings put secure spell_checker_enabled 0`);
    }
    if (enableHardwareKeyboard) {
      await adb(port, `shell settings put secure show_ime_with_hard_keyboard 0`);
    }
  } finally {
    console.log(`::endgroup::`);
  }
}

/**
 * Kills the running emulator on the default port.
 */
export async function killEmulator(port: number): Promise<void> {
  try {
    console.log(`::group::Terminate Emulator`);
    await adb(port, `emu kill`);
  } catch (error) {
    console.log(error instanceof Error ? error.message : error);
  } finally {
    console.log(`::endgroup::`);
  }
}

async function adb(port: number, command: string): Promise<number> {
  return await exec.exec(`adb -s emulator-${port} ${command}`);
}

/**
 * Wait for emulator to boot.
 */
async function waitForDevice(apiLevel: number, port: number, emulatorBootTimeout: number, locale?: string): Promise<void> {
  console.log(`waitForDevice() apiLevel: '${apiLevel}'`);
  let booted = false;
  let localeChanged = locale === undefined;
  let attempts = 0;
  const retryInterval = 2; // retry every 2 seconds
  let maxAttempts = emulatorBootTimeout / 2;
  while (!booted) {
    try {
      let result = '';
      await exec.exec(`adb -s emulator-${port} shell getprop sys.boot_completed`, [], {
        listeners: {
          stdout: (data: Buffer) => {
            result += data.toString();
          },
        },
      });
      if (result.trim() === '1') {
        console.log('Emulator booted.');
        booted = true;
        break;
      }
    } catch (error) {
      console.warn(error instanceof Error ? error.message : error);
    }

    if (attempts < maxAttempts) {
      await delay(retryInterval * 1000);
    } else {
      throw new Error(`Timeout waiting for emulator to boot.`);
    }
    attempts++;
  }
  attempts = 0;
  if (locale) {
    while (!localeChanged) {
      try {
        let result = '';
        await exec.exec(`adb -s emulator-${port} shell getprop persist.sys.locale`, [], {
          listeners: {
            stdout: (data: Buffer) => {
              result += data.toString();
            },
          },
        });
        if (result.trim() === locale) {
          console.log('Emulator locale changed.');
          break;
        }
      } catch (error) {
        console.warn(error instanceof Error ? error.message : error);
      }
  
      if (attempts < maxAttempts) {
        await delay(retryInterval * 1000);
      } else {
        throw new Error(`Timeout waiting for emulator to change locale.`);
      }
      attempts++;
    }
    attempts = 0;
    maxAttempts = 10;
    let broadcasts = '0';
    await exec.exec(`/bin/bash -c "adb -s emulator-${port} logcat -d | grep 'Sending CONNECTED broadcast for type 1' | wc -l | tr -d ' '"`, [], {
      listeners: {
        stdout: (data: Buffer) => {
          broadcasts = data.toString();
        },
      },
    });
    while (!localeChanged) {
      try {
        let result = '';
        await exec.exec(`/bin/bash -c "adb -s emulator-${port} logcat -d | grep 'Sending CONNECTED broadcast for type ${apiLevel === 35 ? '' : '1'}' | wc -l | tr -d ' '"`, [], {
          listeners: {
            stdout: (data: Buffer) => {
              result += data.toString();
            },
          },
        });
        if (parseInt(result.trim(), 10) > parseInt(broadcasts, 10)) {
          console.log('Emulator network ready.');
          localeChanged = true;
          await delay(retryInterval * 1000);
          break;
        }
      } catch (error) {
        console.warn(error instanceof Error ? error.message : error);
      }
  
      if (attempts < maxAttempts) {
        await delay(retryInterval * 1000);
      } else {
        throw new Error(`Timeout waiting for emulator network to be ready.`);
      }
      attempts++;
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
