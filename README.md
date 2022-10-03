# Surreal-Notebook 
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

![Example notebook](https://github.com/mathe42/surreal-notebook/raw/main/example.png)

## This extiension add notebooks for SurrealQL!
All querys are preceded with
```sql
USE NS default DB default
```
so you are allways running your statements in a DB.

## Create a notebook
Just create a file with the extension `.srqlnb` and it should start working!

## Configuration
In default configuration you use the included wasm build as the db. You can change that by setting `surreal.notebook.use-wasm` to `false`. Then it uses the "normal" `surreal` build. 
> Note that you have to install it and set PATH env-var or set in `surreal.notebook. exec` a path to the executable.

In default configuration for each notebook a new instance is created you can change that by setting `surreal.notebook.shared` to `true` that it will use 1 instance for the complete workspace.

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center"><a href="http://ec-nordbund.de"><img src="https://avatars.githubusercontent.com/u/24830662?v=4?s=100" width="100px;" alt="Sebastian Krüger"/><br /><sub><b>Sebastian Krüger</b></sub></a><br /><a href="https://github.com/surrealdb-community/surrealdb.worker/commits?author=mathe42" title="Code">💻</a> <a href="#maintenance-mathe42" title="Maintenance">🚧</a></td>
    </tr>
  </tbody>
  <tfoot>
    
  </tfoot>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
