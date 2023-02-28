import React from 'react';
import logo from './logo.svg';
import './App.css';
import { MockBatteryDataProvider } from './MockBatteryDataProvider';
import { BatteryGraph } from './battery-analytics/BatteryGraph';

function App() {
	return (
		<div className="App">
			<header className="App-header">
				<img src={logo} className="App-logo" alt="logo" />
				<p>
					Edit <code>src/App.tsx</code> and save to reload.
				</p>
				<a
					className="App-link"
					href="https://reactjs.org"
					target="_blank"
					rel="noopener noreferrer"
				>
					Learn React
				</a>
				<BatteryGraph
					width={268*window.devicePixelRatio}
					height={200*window.devicePixelRatio}
					dataProvider={MockBatteryDataProvider}
					style={{
						width: '268px',
						height: '200px',
						border: '2px solid red',
						padding: '0px'
					}}/>
			</header>
		</div>
	);
}

export default App;
