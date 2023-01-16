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
import { PluginBackend } from './PluginBackend';


const DeckyPluginRouterTest: VFC = () => {
	return (
		<div style={{ marginTop: "50px", color: "white" }}>
			Hello World!
			<DialogButton onClick={() => Router.NavigateToLibraryTab()}>
				Go to Store
			</DialogButton>
		</div>
	);
};

export default definePlugin((serverApi: ServerAPI) => {
	const backendAPI = new PluginBackend(serverApi);
	serverApi.routerHook.addRoute("/battery-details", DeckyPluginRouterTest, {
		exact: true,
	});

	return {
		title: <div className={staticClasses.Title}>Battery Info</div>,
		content: <MainPage backendAPI={backendAPI} />,
		icon: <FaBatteryFull />,
		onDismount() {
			serverApi.routerHook.removeRoute("/battery-details");
		},
	};
});
