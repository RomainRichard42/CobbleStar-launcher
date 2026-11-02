package fr.cobblestar.clientcompat;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.Constant;
import org.spongepowered.asm.mixin.injection.ModifyConstant;

@Pseudo
@Mixin(targets = "fr.cobblestar.planets.client.CobbleStarWindowBranding", remap = false)
abstract class WindowIconMixin {
    // The 3000px GUI image exceeds the default X11 request limit as an RGBA window icon.
    @ModifyConstant(method = "apply", constant = @Constant(stringValue = "/assets/cobblestar_planets/textures/gui/brand/logo_cercle_5.png"), require = 0)
    private static String cobblestar$useWindowIcon(String original) {
        return "/assets/cobblestar_pose_compat/window-icon.png";
    }
}
