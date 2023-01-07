import {
	definePlugin,
	DialogButton,
	Router,
	ServerAPI,
	staticClasses
} from 'decky-frontend-lib';
import { VFC } from 'react';
import { FaBatteryFull } from 'react-icons/fa';

import { MainPage } from './MainPage';


const DeckyPluginRouterTest: VFC = () => {
	return (
		<div style={{ marginTop: "50px", color: "white" }}>
			Hello World!
			<DialogButton onClick={() => Router.NavigateToStore()}>
				Go to Store
			</DialogButton>
		</div>
	);
};

export default definePlugin((serverApi: ServerAPI) => {
	serverApi.routerHook.addRoute("/battery-details", DeckyPluginRouterTest, {
		exact: true,
	});

	return {
		title: <div className={staticClasses.Title}>Battery Info</div>,
		content: <MainPage serverAPI={serverApi} />,
		icon: <FaBatteryFull />,
		onDismount() {
			serverApi.routerHook.removeRoute("/battery-details");
		},
	};
});
