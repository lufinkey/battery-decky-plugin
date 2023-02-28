import {
	ButtonItem,
	PanelSection,
	PanelSectionRow,
	Router
} from 'decky-frontend-lib';
import { VFC } from 'react';
import { BatteryGraph } from './BatteryGraph';
import { PluginBackend } from './PluginBackend';

const BatteryGraphWidth = 268;
const BatteryGraphHeight = 200;

export const MainPage: VFC<{ backendAPI: PluginBackend }> = ({ backendAPI }) => {
	return (
		<PanelSection title="Panel Section">
			<PanelSectionRow>
				<BatteryGraph
					width={BatteryGraphWidth*window.devicePixelRatio}
					height={BatteryGraphHeight*window.devicePixelRatio}
					dataProvider={backendAPI}
					style={{
						width: BatteryGraphWidth+'px',
						height: BatteryGraphHeight+'px',
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
