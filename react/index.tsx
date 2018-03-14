import {canUseDOM} from 'exenv'
import createHistory from 'history/createBrowserHistory'
import {hydrate, render as renderDOM} from 'react-dom'
import {AppContainer} from 'react-hot-loader'
import {Helmet} from 'react-helmet'
import NoSSR from 'react-no-ssr'
import React, {ReactElement} from 'react'

import {registerEmitter} from './utils/events'
import {addLocaleData} from './utils/locales'
import {getState} from './utils/client'
import RenderProvider from './components/RenderProvider'
import Link from './components/Link'
import ExtensionContainer from './ExtensionContainer'
import ExtensionPoint from './ExtensionPoint'

if (global.IntlPolyfill) {
  if (!global.Intl) {
    global.Intl = global.IntlPolyfill
  } else if (!canUseDOM) {
    global.Intl.NumberFormat = global.IntlPolyfill.NumberFormat
    global.Intl.DateTimeFormat = global.IntlPolyfill.DateTimeFormat
  }
}

function renderToStringWithData(component: ReactElement<any>): Promise<ServerRendered> {
  var startGetDataFromTree = global.hrtime()
  return require('react-apollo').getDataFromTree(component).then(() => {
    var endGetDataFromTree = global.hrtime(startGetDataFromTree)

    var startRenderToString = global.hrtime()
    var markup = require('react-dom/server').renderToString(component)
    var endRenderToString = global.hrtime(startRenderToString)
    return {
      markup,
      renderTimeMetric: {
        getDataFromTree: endGetDataFromTree,
        renderToString: endRenderToString,
      },
    }
  })
}

// Map `placeholder/with/slashes` to `render-placeholder-with-slashes`.
const containerId = (name: string) => `render-${name.replace(/\//g, '-')}`

// Whether this placeholder has a component.
const hasComponent = (extensions: Extensions) => (name: string) => !!extensions[name].component

// The placeholder "foo/bar" is root if there is no placeholder "foo" (inside names)
const isRoot = (name: string, index: number, names: string[]) =>
  names.find(parent => name !== parent && name.startsWith(parent)) === undefined

// Either renders the root component to a DOM element or returns a {name, markup} promise.
const render = (name: string, runtime: RenderRuntime, element?: HTMLElement): Rendered => {
  const {customRouting, disableSSR, pages, extensions, culture: {locale}} = runtime

  registerEmitter(runtime)
  addLocaleData(locale)

  const isPage = !!pages[name] && !!pages[name].path && !!extensions[name].component
  const id = isPage ? 'render-container' : containerId(name)
  const elem = element || (canUseDOM ? document.getElementById(id) : null)
  const history = canUseDOM && isPage && !customRouting ? createHistory() : null
  const root = (
    <AppContainer>
      <RenderProvider history={history} root={name} runtime={runtime}>
        {!isPage ? <ExtensionPoint id={name} /> : null}
      </RenderProvider>
    </AppContainer>
  )
  return canUseDOM
    ? (disableSSR ? renderDOM(root, elem) : hydrate(root, elem)) as Element
    : renderToStringWithData(root).then(({markup, renderTimeMetric}) => ({
      name,
      renderTimeMetric,
      markup: `<div id="${id}">${markup}</div>`,
    }))
}

function getRenderableExtensionPointNames(rootName: string, extensions: Extensions) {
  const childExtensionPoints = Object.keys(extensions).reduce((acc, value) => {
    if (value.startsWith(rootName)) {
      acc[value] = extensions[value]
    }
    return acc
  }, {} as Extensions)
  // Names of all extensions with a component
  const withComponentNames = Object.keys(childExtensionPoints).filter(
    hasComponent(childExtensionPoints),
  )
  // Names of all top-level extensions with a component
  const rootWithComponentNames = withComponentNames.filter(isRoot)
  return rootWithComponentNames
}

function start() {
  const runtime = global.__RUNTIME__
  const renderableExtensionPointNames = getRenderableExtensionPointNames(runtime.page, runtime.extensions)

  try {
    // If there are multiple renderable extensions, render them in parallel.
    const renderPromises = renderableExtensionPointNames.map(e => render(e, runtime))
    console.log('Welcome to Render! Want to look under the hood? http://lab.vtex.com/careers/')
    if (!canUseDOM) {
      // Expose render promises to global context.
      global.rendered = Promise.all(renderPromises as Promise<NamedServerRendered>[]).then(results => ({
        head: Helmet.rewind(),
        extensions: results.reduce(
          (acc, {name, markup}) => (acc[name] = markup, acc),
          {} as RenderedSuccess['extensions'],
        ),
        renderMetrics: results.reduce(
          (acc, {name, renderTimeMetric}) => (acc[name] = renderTimeMetric, acc),
          {} as RenderedSuccess['renderMetrics'],
        ),
        state: getState(runtime),
      }))
    }
  } catch (error) {
    console.error('Unexpected error rendering:', error)
    if (!canUseDOM) {
      global.rendered = {error}
    }
  }
}

global.__RENDER_7_RUNTIME__ = {
  start,
  render,
  ExtensionContainer,
  ExtensionPoint,
  Link,
  NoSSR,
  Helmet,
  canUseDOM,
}