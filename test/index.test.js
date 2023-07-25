/* eslint-disable jest/expect-expect */
/*
Copyright 2023 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const helpers = require('yeoman-test')
const assert = require('yeoman-assert')
const fs = require('fs')
const { EOL } = require('os')
const yaml = require('js-yaml')
const path = require('path')
const cloneDeep = require('lodash.clonedeep')
const theGeneratorPath = require.resolve('../index')
const Generator = require('yeoman-generator')

const { constants } = require('@adobe/generator-app-common-lib')
describe('prototype', () => {
  test('exports a yeoman generator', () => {
    expect(require(theGeneratorPath).prototype).toBeInstanceOf(Generator)
  })
})

function assertGeneratedFiles (actionName, pkgName) {
  assert.file(`${constants.actionsDirname}/${actionName}/index.js`)
  assert.file(`${constants.actionsDirname}/utils.js`)
}

/* eslint no-unused-vars: 0 */
function assertManifestContent (actionName, pkgName) {
  const json = yaml.load(fs.readFileSync('ext.config.yaml').toString())
  expect(json.runtimeManifest.packages).toBeDefined()

  // default packageName is path.basename(path.dirname('ext.config.yaml'))
  pkgName = pkgName || path.basename(process.cwd())

  expect(json.runtimeManifest.packages[pkgName].actions[actionName]).toEqual({
    function: path.normalize(`${constants.actionsDirname}/${actionName}/index.js`),
    web: 'yes',
    runtime: constants.defaultRuntimeKind,
    inputs: {
      LOG_LEVEL: 'debug',
      apiKey: '$SERVICE_API_KEY'
    },
    annotations: {
      final: true,
      'require-adobe-auth': true
    }
  })
}

function assertEnvContent (prevContent) {
  assert.fileContent('.env', prevContent)
}

function assertEventCodeContent (actionName) {
  const theFile = `${constants.actionsDirname}/${actionName}/index.js`
  // a few checks to make sure the action calls the events sdk to publish cloud events
  assert.fileContent(
    theFile,
    'const { Core, Events } = require(\'@adobe/aio-sdk\')'
  )
  assert.fileContent(
    theFile,
    'const requiredParams = [\'apiKey\', \'providerId\', \'eventCode\', \'payload\']'
  )
  assert.fileContent(
    theFile,
    'const requiredHeaders = [\'Authorization\', \'x-gw-ims-org-id\']'
  )
  assert.fileContent(
    theFile,
    'const eventsClient = await Events.init(orgId, params.apiKey, token)'
  )
  assert.fileContent(
    theFile,
    'const published = await eventsClient.publishEvent(cloudEvent)'
  )
}

describe('run', () => {
  test('--skip-prompt', async () => {
    const options = cloneDeep(global.basicGeneratorOptions)
    options['skip-prompt'] = true
    const prevDotEnvContent = 'PREVIOUSCONTENT\n'
    try {
      await helpers.run(theGeneratorPath)
        .withOptions(options)
        .inTmpDir(dir => {
          fs.writeFileSync(path.join(dir, '.env'), prevDotEnvContent)
        })
    } catch (e) {
      console.error(e)
    }

    // default
    const actionName = 'publish-events'

    assertGeneratedFiles(actionName)
    assertEventCodeContent(actionName)
    assertManifestContent(actionName)
    assertDependencies(fs, {
      '@adobe/aio-sdk': expect.any(String),
      cloudevents: expect.any(String),
      uuid: expect.any(String)
    }, { '@openwhisk/wskdebug': expect.any(String) })
    assertNodeEngines(fs, constants.nodeEngines)
  })

  test('--skip-prompt, and action with default name already exists', async () => {
    const options = cloneDeep(global.basicGeneratorOptions)
    options['skip-prompt'] = true
    const prevDotEnvContent = `PREVIOUSCONTENT${EOL}`
    await helpers.run(theGeneratorPath)
      .withOptions(options)
      .inTmpDir(dir => {
        fs.writeFileSync('ext.config.yaml', yaml.dump({
          runtimeManifest: {
            packages: {
              somepackage: {
                actions: {
                  'publish-events': { function: 'fake.js' }
                }
              }
            }
          }
        }))
        fs.writeFileSync(path.join(dir, '.env'), prevDotEnvContent)
      })

    // default
    const actionName = 'publish-events-1'
    assertGeneratedFiles(actionName)
    assertManifestContent(actionName, 'somepackage')
    assertEnvContent(prevDotEnvContent)
    assertDependencies(fs, {
      '@adobe/aio-sdk': expect.any(String),
      cloudevents: expect.any(String),
      uuid: expect.any(String)
    }, { '@openwhisk/wskdebug': expect.any(String) })
    assertNodeEngines(fs, constants.nodeEngines)
  })

  test('user input actionName=fakeAction', async () => {
    const prevDotEnvContent = 'PREVIOUSCONTENT\n'
    const options = cloneDeep(global.basicGeneratorOptions)
    options['skip-prompt'] = false
    await helpers.run(theGeneratorPath)
      .withOptions(options)
      .withPrompts({ actionName: 'fakeAction' })
      .inTmpDir(dir => {
        fs.writeFileSync(path.join(dir, '.env'), prevDotEnvContent)
      })

    const actionName = 'fakeAction'

    assertGeneratedFiles(actionName)
    assertEventCodeContent(actionName)
    assertManifestContent(actionName)
    assertEnvContent(prevDotEnvContent)
    assertDependencies(fs, {
      '@adobe/aio-sdk': expect.any(String),
      cloudevents: expect.any(String),
      uuid: expect.any(String)
    }, { '@openwhisk/wskdebug': expect.any(String) })
    assertNodeEngines(fs, constants.nodeEngines)
  })
})
