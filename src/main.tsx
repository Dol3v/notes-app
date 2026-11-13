import '@fontsource/rubik/400.css'
import '@fontsource/rubik/500.css'
import '@fontsource/rubik/700.css'
import './styles.css'
import { render } from 'preact'
import { App } from './ui/App'

render(<App />, document.getElementById('app')!)
