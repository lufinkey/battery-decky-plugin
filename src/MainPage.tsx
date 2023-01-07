import {
	ButtonItem,
	PanelSection,
	PanelSectionRow,
	Router,
	ServerAPI
} from 'decky-frontend-lib';
import { VFC } from 'react';

export const MainPage: VFC<{ serverAPI: ServerAPI }> = ({}) => {
	return (
		<PanelSection title="Panel Section">
			<PanelSectionRow>
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
