import {
	ButtonItem,
	PanelSection,
	PanelSectionRow,
	Router
} from 'decky-frontend-lib';
import { VFC } from 'react';
import { BatteryGraph } from './BatteryGraph';
import { PluginBackend } from './PluginBackend';

export const MainPage: VFC<{ backendAPI: PluginBackend }> = ({ backendAPI }) => {
	return (
		<PanelSection title="Panel Section">
			<PanelSectionRow>
				<BatteryGraph
					width={268}
					height={200}
					backendAPI={backendAPI}
					style={{
						width: '268px',
						height: '200px',
						padding: '0px'
					}}/>
				<ButtonItem
					layout="below"
					onClick={() => {
						Router.CloseSideMenus();
						Router.Navigate("/battery-details");
					}}>
					Battery Details
				</ButtonItem>
			</PanelSectionRow>
		</PanelSection>
	);
};
