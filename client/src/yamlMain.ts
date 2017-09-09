/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import { workspace, languages, ExtensionContext, extensions, Uri, Range } from 'vscode';
import { LanguageClient, LanguageClientOptions, RequestType, ServerOptions, TransportKind, NotificationType } from 'vscode-languageclient';
import { activateColorDecorations } from "./colorDecorators";

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}

namespace ColorSymbolRequest {
	export const type: RequestType<string, Range[], any, any> = new RequestType('yaml/colorSymbols');
}

export interface ISchemaAssociations {
	[pattern: string]: string[];
}

namespace SchemaAssociationNotification {
	export const type: NotificationType<ISchemaAssociations, any> = new NotificationType('json/schemaAssociations');
}

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

export function activate(context: ExtensionContext) {

	let packageInfo = getPackageInfo(context);

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'yamlServerMain.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--debug=6004'] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for yaml documents
		documentSelector: ['yaml'],
		synchronize: {
			// Synchronize the setting section 'yaml' to the server
			configurationSection: ['yaml', 'json.schemas', 'http.proxy', 'http.proxyStrictSSL'],
			fileEvents: workspace.createFileSystemWatcher('**/*.?(e)y?(a)ml')
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient('yaml', localize('yamlserver.name', 'YAML Language Server'), serverOptions, clientOptions);
	let disposable = client.start();
	client.onReady().then(() => {
		// handle content request
		client.onRequest(VSCodeContentRequest.type, (uriPath: string) => {
			let uri = Uri.parse(uriPath);
			return workspace.openTextDocument(uri).then(doc => {
				return doc.getText();
			}, error => {
				return Promise.reject(error);
			});
		});

		client.sendNotification(SchemaAssociationNotification.type, getSchemaAssociation(context));

		let colorRequestor = (uri: string) => {
			return client.sendRequest(ColorSymbolRequest.type, uri).then(ranges => ranges.map(client.protocol2CodeConverter.asRange));
		};
		let isDecoratorEnabled = (languageId: string) => {
			return false;
		};
		disposable = activateColorDecorations(colorRequestor, { yaml: true }, isDecoratorEnabled);
		context.subscriptions.push(disposable);
	});

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	languages.setLanguageConfiguration('yaml', {
		wordPattern: /("(?:[^\\\"]*(?:\\.)?)*"?)|[^\s{}\[\],:]+/
	});
}

function getSchemaAssociation(context: ExtensionContext): ISchemaAssociations {
	let associations: ISchemaAssociations = {};
	extensions.all.forEach(extension => {
		let packageJSON = extension.packageJSON;
		if (packageJSON && packageJSON.contributes && packageJSON.contributes.jsonValidation) {
			let jsonValidation = packageJSON.contributes.jsonValidation;
			if (Array.isArray(jsonValidation)) {
				jsonValidation.forEach(jv => {
					let { fileMatch, url } = jv;
					if (fileMatch && url) {
						if (url[0] === '.' && url[1] === '/') {
							url = Uri.file(path.join(extension.extensionPath, url)).toString();
						}
						if (fileMatch[0] === '%') {
							fileMatch = fileMatch.replace(/%APP_SETTINGS_HOME%/, '/User');
						} else if (fileMatch.charAt(0) !== '/' && !fileMatch.match(/\w+:\/\//)) {
							fileMatch = '/' + fileMatch;
						}
						let association = associations[fileMatch];
						if (!association) {
							association = [];
							associations[fileMatch] = association;
						}
						association.push(url);
					}
				});
			}
		}
	});
	return associations;
}

function getPackageInfo(context: ExtensionContext): IPackageInfo {
	let extensionPackage = require(context.asAbsolutePath('./package.json'));
	if (extensionPackage) {
		return {
			name: extensionPackage.name,
			version: extensionPackage.version,
			aiKey: extensionPackage.aiKey
		};
	}
	return null;
}
