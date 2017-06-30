# [YAML](http://yaml.org/) for Visual Studio Code

## Features

  * [JSON Schema](http://json-schema.org/) validation
  * Quick Navigation (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd>)
  * Document formatting
  * Hover data descriptions (when provided by active schemas)

## How to associate schemas
Schemas are handled exactly [same way they are with JSON in Visual Studio Code](https://code.visualstudio.com/Docs/languages/json#_json-schemas-settings) and your schema file must still be written in JSON.  This means you can:

- [Declare in the current file][file] by specify a `$schema` element.
- Map files by settings using the `json.schemas` settings key in [User Settings][user], [Workspace Settings][workspace], or even [define your schema within Settings][within].
- Define in extensions using the [`jsonValidation` contribution point][extension].

[file]: https://code.visualstudio.com/Docs/languages/json#_mapping-in-the-json
[user]: https://code.visualstudio.com/Docs/languages/json#_mapping-in-the-user-settings
[workspace]: https://code.visualstudio.com/Docs/languages/json#_mapping-to-a-schema-in-the-workspace
[within]: https://code.visualstudio.com/Docs/languages/json#_mapping-to-a-schema-defined-in-settings
[extension]: https://code.visualstudio.com/docs/extensionAPI/extension-points#_contributesjsonvalidation

## Known Issues
 - No support has been implemented for anchor reference or includes. ([relevant code](https://github.com/adamvoss/vscode-yaml-languageservice/blob/e878a9636fc3cf43d9105c8c1ba02f02fea6d18c/src/parser/yamlParser.ts#L237-L242))
 - Only one document is supported per file.
 - Color decorators (`yaml.colorDecorators.enable`) do not work even when enabled.

## Acknowledgments
This extension would not have been possible without numerous open source projects.  Please see [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md).

## Contributing
Contributions are welcome!  To install dependencies and begin work, run:

```sh
git submodule update --init --recursive
npm install
```

This was forked from https://github.com/Microsoft/vscode/tree/master/extensions/json, to prepare the latest commits from upstream, use:

```sh
git clone https://github.com/Microsoft/vscode.git
cd vscode
git checkout -b vscode-json
git filter-branch --prune-empty --subdirectory-filter extensions/json/ vscode-json
```