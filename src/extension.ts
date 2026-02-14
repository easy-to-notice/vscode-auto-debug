import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
var minimatch = require("minimatch");

// 从 settings.json 获取调试配置
function getDebugConfigFromSettings(configName: string): DebugConfiguration | undefined {
    // 从 launch 配置中查找
    const launchConfigs = vscode.workspace.getConfiguration('launch').get<DebugConfiguration[]>('configurations');
    if (launchConfigs) {
        const config = launchConfigs.find(c => c.name === configName);
        if (config) {
            return config;
        }
    }
    
    // 如果没有找到，尝试从 debug.auto-debug 或其他配置中查找
    // 这里可以扩展支持更多的配置来源
    return undefined;
}

export async function globLaunch(folder: WorkspaceFolder | undefined, dictionaryOfGlobPatterns: object, options: vscode.DebugSessionOptions | undefined) {
    if (!vscode.window.activeTextEditor) {
        vscode.window.showInformationMessage('no active file in text editor');
        return;
    }
    var activeFilenameWithPath = vscode.window.activeTextEditor.document.fileName;

    // run the first glob match in the user map
    for (let [globPattern, launchTaskName] of Object.entries(dictionaryOfGlobPatterns)) {
        var matchExists = minimatch(activeFilenameWithPath, globPattern, { matchBase: true });
        if (matchExists) {
            console.log(`matched "${activeFilenameWithPath}" using {"${globPattern}":"${launchTaskName}"}`);
            
            // 如果有工作区文件夹，优先使用工作区的 launch.json
            if (folder) {
                try {
                    await vscode.debug.startDebugging(folder, launchTaskName, options);
                    return;
                } catch (error) {
                    console.log('Failed to start debugging from workspace, trying settings...');
                }
            }
            
            // 尝试从 settings.json 获取配置
            const config = getDebugConfigFromSettings(launchTaskName);
            if (config) {
                // 使用获取到的完整配置启动调试
                await vscode.debug.startDebugging(folder, config, options);
            } else {
                // 如果 settings 中也没有，尝试直接启动（可能配置在其他地方）
                await vscode.debug.startDebugging(folder, launchTaskName, options);
            }
            return;
        }
    }

    vscode.window.showInformationMessage(`no globs matched current active file: ${activeFilenameWithPath}`);
}

class AutoDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

        // hand off to the appropriate debugger instead of setting one up here
        globLaunch(folder, config.map, { "noDebug": config.noDebug });

        // cancel this debug session
        return undefined;
    }
}

export async function manualGlobLaunch() {
    // 尝试从 settings.json 获取 auto 配置
    const config = getDebugConfigFromSettings('auto');
    if (config) {
        await vscode.debug.startDebugging(undefined, config);
    } else {
        // 如果没有找到配置，尝试使用名称启动
        await vscode.debug.startDebugging(undefined, 'auto');
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('activated "auto-debug-no-workspace"');

    // register the debug configuration
    const provider = new AutoDebugConfigurationProvider();
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('auto-debug-no-workspace', provider));

    // register a manual command
    let disposable = vscode.commands.registerCommand('auto-debug-no-workspace.auto-debug', manualGlobLaunch);
    context.subscriptions.push(disposable);
}

export function deactivate() { }
