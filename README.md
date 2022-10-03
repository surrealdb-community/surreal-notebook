# Surreal-Notebook 

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
