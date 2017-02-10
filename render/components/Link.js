import React, {PropTypes} from 'react'

const isLeftClickEvent = (event) => event.button === 0

const isModifiedEvent = (event) => !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)

const createLocationDescriptor = (to, {query}) => query ? { pathname: to, search: query} : to

//eslint-disable-next-line
export default class Link extends React.Component {
  constructor (props) {
    super(props)
    this.handleClick = this.handleClick.bind(this)
  }

  handleClick (event) {
    if (isModifiedEvent(event) || !isLeftClickEvent(event)) {
      return
    }

    event.preventDefault()
    const {to, query} = this.props
    const location = createLocationDescriptor(to, {query})
    global.browserHistory.push(location)
  }

  render () {
    return (
      <a href={this.props.to} {...this.props} onClick={this.handleClick} />
    )
  }
}

Link.propTypes = {
  query: PropTypes.string,
  to: PropTypes.string,
}
