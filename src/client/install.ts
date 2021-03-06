#!/bin/env -S deno run --allow-run --allow-net
import InputLoop from 'https://deno.land/x/input@2.0.2/index.ts'
import { runAsIsla, runAsRoot, message } from './isla.ts'

const deleteDBLock = () => runAsRoot(['rm', '-f', '/var/lib/pacman/db.lck']).status()

await runAsRoot(['pacman', '-Fy', '--noconfirm']).status()
await deleteDBLock()
await runAsRoot(['pacman', '-Sy', '--noconfirm']).status()
await deleteDBLock()

interface Choice {
  repo: string
  pkg: string
}

const pacmanSearchFile = async (file: string) => {
  const out = new TextDecoder().decode(await runAsIsla(['yay', '-F', '--machinereadable', file]).output())
  const outArr = out.split(' ')
  const choices: Choice[] = []
  for (let i = 1; i < (outArr.length + 1) / 4; i++) {
    const repo = outArr[i * 4 - 4]
    const pkg = outArr[i * 4 - 3]
    choices.push({ repo: repo, pkg: pkg })
  }
  return choices
}

const pacmanSearchPackage = async (pkgname: string): Promise<Choice[]> =>
  new TextDecoder()
    .decode(await runAsIsla(['yay', '-Ss', '--machinereadable', `^${pkgname}$`]).output())
    .split('\n')
    .filter((line) => !!line)
    .filter((line) => !line.startsWith('    '))
    .map((packageLine) => packageLine.split(' ')[0])
    .map((packageString) => packageString.split('/'))
    .map((packageArray) => ({ repo: packageArray[0], pkg: packageArray[1] }))

let tmpChoices: Choice[] = []
tmpChoices = [...tmpChoices, ...(await pacmanSearchFile(`/usr/bin/${Deno.args[0]}`))]
await deleteDBLock()
tmpChoices = [...tmpChoices, ...(await pacmanSearchPackage(Deno.args[0]))]
await deleteDBLock()
const choices = [...new Set(tmpChoices.map((choice) => `${choice.repo}/${choice.pkg}`))]

const input = new InputLoop()
let target = ''
if (!choices.length) {
  console.log(await message('error', `Could not find any packages that contain ${Deno.args[0]}`))
  Deno.exit(1)
} else if (choices.length == 1) target = choices[0]
else {
  const answers = await input.choose(choices)

  const answerIndex = answers.findIndex((ans) => ans)
  if (answerIndex === -1) {
    console.log(await message('success', 'Did not install anything'))
    Deno.exit(1)
  }
  target = choices[answerIndex]
}

console.log(await message('success', `Found package for ${Deno.args[0]}!`))

await runAsIsla(['yay', '--noconfirm', '-S', target], 'inherit').status()
