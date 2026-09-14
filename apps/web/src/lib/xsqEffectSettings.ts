import { DEFAULT_PALETTE_HEX, EFFECT_SCHEMAS, defaultParamsFor, isValueCurve, resolveParam, isColorCurve } from "@webxlights/engine";
import type { SequenceEffect } from "./api";

// Native key names and choice values verified against xLights resources/effectmetadata
// and checked against the stable 2025.13 effect panels/renderers (0a7402f0).
// Explicit mappings avoid guessing similarly named controls. Wave keeps the legacy
// degree slider, which newer xLights versions migrate to their cycle-count control.
// https://github.com/xLightsSequencer/xLights/tree/master/resources/effectmetadata
interface ParamMapping { key: string; choices?: string[]; boolean?: boolean; scale?: number; min?: number; max?: number }
const PARAMS: Record<string, Record<string, ParamMapping>> = {
  "On": {
    startIntensity: {"key": "E_TEXTCTRL_Eff_On_Start","min": 0,"max": 100},
    endIntensity: {"key": "E_TEXTCTRL_Eff_On_End","min": 0,"max": 100},
    transparencyPct: {"key": "E_TEXTCTRL_On_Transparency","min": 0,"max": 100},
    cycles: {"key": "E_TEXTCTRL_On_Cycles","min": 0.0,"max": 100.0},
    shimmer: {"key": "E_CHECKBOX_On_Shimmer","boolean": true},
  },
  "Bars": {
    paletteRep: {"key": "E_SLIDER_Bars_BarCount","min": 1,"max": 5},
    cycles: {"key": "E_TEXTCTRL_Bars_Cycles","min": 0.0,"max": 30.0},
    direction: {"key": "E_CHOICE_Bars_Direction","choices": ["up","down","expand","compress","Left","Right","H-expand","H-compress","Alternate Up","Alternate Down","Alternate Left","Alternate Right","Custom Horz","Custom Vert"]},
    centerPercent: {"key": "E_TEXTCTRL_Bars_Center","min": -100,"max": 100},
    highlight: {"key": "E_CHECKBOX_Bars_Highlight","boolean": true},
  },
  "Color Wash": {
    cycles: {"key": "E_TEXTCTRL_ColorWash_Cycles","min": 0.1,"max": 20.0},
    verticalFade: {"key": "E_CHECKBOX_ColorWash_VFade","boolean": true},
    horizontalFade: {"key": "E_CHECKBOX_ColorWash_HFade","boolean": true},
    reverseFades: {"key": "E_CHECKBOX_ColorWash_ReverseFades","boolean": true},
    shimmer: {"key": "E_CHECKBOX_ColorWash_Shimmer","boolean": true},
    circularPalette: {"key": "E_CHECKBOX_ColorWash_CircularPalette","boolean": true},
  },
  "Fire": {
    height: {"key": "E_SLIDER_Fire_Height","min": 1,"max": 100},
    hueShift: {"key": "E_SLIDER_Fire_HueShift","min": 0,"max": 100},
    growthCycles: {"key": "E_TEXTCTRL_Fire_GrowthCycles","min": 0.0,"max": 20.0},
  },
  "Meteors": {
    colors: {"key": "E_CHOICE_Meteors_Type","choices": ["Rainbow","Range","Palette"]},
    count: {"key": "E_SLIDER_Meteors_Count","min": 1,"max": 100},
    trailLength: {"key": "E_SLIDER_Meteors_Length","min": 1,"max": 100},
    speed: {"key": "E_SLIDER_Meteors_Speed","min": 0,"max": 50},
  },
  "Butterfly": {
    colors: {"key": "E_CHOICE_Butterfly_Colors","choices": ["Rainbow","Palette"]},
    chunks: {"key": "E_SLIDER_Butterfly_Chunks","min": 1,"max": 10},
    skip: {"key": "E_SLIDER_Butterfly_Skip","min": 2,"max": 10},
    speed: {"key": "E_SLIDER_Butterfly_Speed","min": 0,"max": 100},
    reverse: {"key": "E_CHOICE_Butterfly_Direction","choices": ["Normal","Reverse"]},
  },
  "SingleStrand": {
    chaseSizePct: {"key": "E_SLIDER_Color_Mix1","min": 1,"max": 100},
    cycles: {"key": "E_TEXTCTRL_Chase_Rotations","min": 0.1,"max": 50.0},
    offsetPct: {"key": "E_TEXTCTRL_Chase_Offset","min": -500.0,"max": 500.0},
  },
  "Snowflakes": {
    speed: {"key": "E_SLIDER_Snowflakes_Speed","min": 0,"max": 50},
  },
  "Spirals": {
    paletteRep: {"key": "E_SLIDER_Spirals_Count","min": 1,"max": 5},
    spiralWraps: {"key": "E_SLIDER_Spirals_Rotation","scale": 10,"min": -300,"max": 300},
    thicknessPct: {"key": "E_SLIDER_Spirals_Thickness","min": 0,"max": 100},
    movement: {"key": "E_TEXTCTRL_Spirals_Movement","min": -20.0,"max": 20.0},
    blend: {"key": "E_CHECKBOX_Spirals_Blend","boolean": true},
  },
  "Twinkle": {
    countPct: {"key": "E_SLIDER_Twinkle_Count","min": 2,"max": 100},
    steps: {"key": "E_SLIDER_Twinkle_Steps","min": 2,"max": 400},
  },
  "Strobe": {
    numberStrobes: {"key": "E_SLIDER_Number_Strobes","min": 1,"max": 300},
    duration: {"key": "E_SLIDER_Strobe_Duration","min": 1,"max": 100},
    type: {"key": "E_SLIDER_Strobe_Type","min": 1,"max": 4},
  },
  "Ripple": {
    movement: {"key": "E_CHOICE_Ripple_Movement","choices": ["Explode","Implode","None"]},
    cycles: {"key": "E_TEXTCTRL_Ripple_Cycles","min": 0.0,"max": 30.0},
    thickness: {"key": "E_SLIDER_Ripple_Thickness","min": 1,"max": 100},
  },
  "Wave": {
    numberOfWavesDeg: {"key": "E_SLIDER_Number_Waves","min": 180,"max": 3600},
    thicknessPct: {"key": "E_SLIDER_Thickness_Percentage","min": 0,"max": 100},
    heightPct: {"key": "E_SLIDER_Wave_Height","min": 0,"max": 100},
    speed: {"key": "E_TEXTCTRL_Wave_Speed","min": 0.0,"max": 50.0},
    leftToRight: {"key": "E_CHOICE_Wave_Direction","choices": ["Right to Left","Left to Right"]},
  },
  "Pinwheel": {
    arms: {"key": "E_SLIDER_Pinwheel_Arms","min": 1,"max": 20},
    armSizePct: {"key": "E_SLIDER_Pinwheel_ArmSize","min": 0,"max": 400},
    thicknessPct: {"key": "E_SLIDER_Pinwheel_Thickness","min": 0,"max": 100},
    speed: {"key": "E_SLIDER_Pinwheel_Speed","min": 0,"max": 50},
    counterClockwise: {"key": "E_CHECKBOX_Pinwheel_Rotation","boolean": true},
  },
  "Shockwave": {
    centerXPct: {"key": "E_SLIDER_Shockwave_CenterX","min": 0,"max": 100},
    centerYPct: {"key": "E_SLIDER_Shockwave_CenterY","min": 0,"max": 100},
    startRadius: {"key": "E_SLIDER_Shockwave_Start_Radius","min": 0,"max": 750},
    endRadius: {"key": "E_SLIDER_Shockwave_End_Radius","min": 0,"max": 750},
    startWidth: {"key": "E_SLIDER_Shockwave_Start_Width","min": 0,"max": 255},
    endWidth: {"key": "E_SLIDER_Shockwave_End_Width","min": 0,"max": 255},
    cycles: {"key": "E_SLIDER_Shockwave_Cycles","min": 1,"max": 100},
    blendEdges: {"key": "E_CHECKBOX_Shockwave_Blend_Edges","boolean": true},
  },
  "Garlands": {
    type: {"key": "E_SLIDER_Garlands_Type","min": 0,"max": 4},
    spacing: {"key": "E_SLIDER_Garlands_Spacing","min": 1,"max": 100},
  },
  "Curtain": {
    edge: {"key": "E_CHOICE_Curtain_Edge","choices": ["left","center","right","bottom","middle","top"]},
    movement: {"key": "E_CHOICE_Curtain_Effect","choices": ["open","close","open then close","close then open"]},
  },
  "Plasma": {
    style: {"key": "E_SLIDER_Plasma_Style","min": 1,"max": 10},
    lineDensity: {"key": "E_SLIDER_Plasma_Line_Density","min": 1,"max": 10},
    speed: {"key": "E_SLIDER_Plasma_Speed","min": 0,"max": 100},
  },
  "Galaxy": {
    centerXPct: {"key": "E_SLIDER_Galaxy_CenterX","min": 0,"max": 100},
    centerYPct: {"key": "E_SLIDER_Galaxy_CenterY","min": 0,"max": 100},
    startRadius: {"key": "E_SLIDER_Galaxy_Start_Radius","min": 0,"max": 250},
    endRadius: {"key": "E_SLIDER_Galaxy_End_Radius","min": 0,"max": 250},
    startAngleDeg: {"key": "E_SLIDER_Galaxy_Start_Angle","min": 0,"max": 360},
    revolutionsDeg: {"key": "E_SLIDER_Galaxy_Revolutions","min": 0,"max": 3600},
    startWidth: {"key": "E_SLIDER_Galaxy_Start_Width","min": 0,"max": 255},
    endWidth: {"key": "E_SLIDER_Galaxy_End_Width","min": 0,"max": 255},
    durationPct: {"key": "E_SLIDER_Galaxy_Duration","min": 0,"max": 100},
    reverse: {"key": "E_CHECKBOX_Galaxy_Reverse","boolean": true},
    blendEdges: {"key": "E_CHECKBOX_Galaxy_Blend_Edges","boolean": true},
    inward: {"key": "E_CHECKBOX_Galaxy_Inward","boolean": true},
  },
  "Fan": {
    centerXPct: {"key": "E_SLIDER_Fan_CenterX","min": 0,"max": 100},
    centerYPct: {"key": "E_SLIDER_Fan_CenterY","min": 0,"max": 100},
    startAngleDeg: {"key": "E_SLIDER_Fan_Start_Angle","min": 0,"max": 360},
    revolutionsDeg: {"key": "E_SLIDER_Fan_Revolutions","min": 0,"max": 3600},
    bladeCount: {"key": "E_SLIDER_Fan_Num_Blades","min": 1,"max": 16},
    bladeAngleDeg: {"key": "E_SLIDER_Fan_Blade_Angle","min": -360,"max": 360},
    elementCount: {"key": "E_SLIDER_Fan_Num_Elements","min": 1,"max": 4},
    elementWidthPct: {"key": "E_SLIDER_Fan_Element_Width","min": 5,"max": 100},
    reverse: {"key": "E_CHECKBOX_Fan_Reverse","boolean": true},
    blendEdges: {"key": "E_CHECKBOX_Fan_Blend_Edges","boolean": true},
  },
  "Marquee": {
    bandSize: {"key": "E_SLIDER_Marquee_Band_Size","min": 1,"max": 100},
    skipSize: {"key": "E_SLIDER_Marquee_Skip_Size","min": 0,"max": 100},
    thickness: {"key": "E_SLIDER_Marquee_Thickness","min": 1,"max": 100},
    stagger: {"key": "E_SLIDER_Marquee_Stagger","min": 0,"max": 50},
    speed: {"key": "E_SLIDER_Marquee_Speed","min": 0,"max": 50},
    reverse: {"key": "E_CHECKBOX_Marquee_Reverse","boolean": true},
  },
  "Circles": {
    count: {"key": "E_SLIDER_Circles_Count","min": 1,"max": 10},
    size: {"key": "E_SLIDER_Circles_Size","min": 1,"max": 20},
    speed: {"key": "E_SLIDER_Circles_Speed","min": 1,"max": 30},
    fade: {"key": "E_CHECKBOX_Circles_Linear_Fade","boolean": true},
    bubbles: {"key": "E_CHECKBOX_Circles_Bubbles","boolean": true},
  },
  "Text": {
    text: {"key": "E_TEXTCTRL_Text"},
    movement: {"key": "E_CHOICE_Text_Dir","choices": ["none","left","right","up","down","vector","up-left","down-left","up-right","down-right","wavey","word-flip","left-right","up-down"]},
    speed: {"key": "E_TEXTCTRL_Text_Speed","min": 0,"max": 100},
    xOffsetPct: {"key": "E_SLIDER_Text_XStart","min": -200,"max": 200},
    yOffsetPct: {"key": "E_SLIDER_Text_YStart","min": -200,"max": 200},
  },
  "Pictures": {
    movement: {"key": "E_CHOICE_Pictures_Direction","choices": ["none","left","right","up","down","up-left","down-left","up-right","down-right","peekaboo","wiggle","zoom in","peekaboo 90","peekaboo 180","peekaboo 270","flag wave","up once","down once","vector","tile-left","tile-right","tile-down","tile-up"]},
  },
  "VU Meter": {
    type: {"key": "E_CHOICE_VUMeter_Type","choices": ["Spectrogram","Spectrogram Peak","Spectrogram Line","Spectrogram Circle Line","Volume Bars","Waveform","Frame Waveform","On","Color On","Dominant Frequency Colour","Dominant Frequency Colour Gradient","Intensity Wave","Pulse","Level Bar","Level Random Bar","Level Color","Level Pulse","Level Jump","Level Jump 100","Level Pulse Color","Level Shape","Timing Event Bar","Timing Event Bar Bounce","Timing Event Random Bar","Timing Event Bars","Timing Event Spike","Timing Event Sweep","Timing Event Sweep 2","Timing Event Timed Sweep","Timing Event Timed Sweep 2","Timing Event Alternate Timed Sweep","Timing Event Alternate Timed Sweep 2","Timing Event Timed Chase From Middle","Timing Event Timed Chase To Middle","Timing Event Color","Timing Event Jump","Timing Event Jump 100","Timing Event Pulse","Timing Event Pulse Color","Note On","Note Level Pulse","Note Level Jump","Note Level Jump 100","Note Level Bar","Note Level Random Bar"]},
    timingTrack: {"key": "E_CHOICE_VUMeter_TimingTrack","choices": []},
    startNote: {"key": "E_SLIDER_VUMeter_StartNote","min": 0,"max": 127},
    endNote: {"key": "E_SLIDER_VUMeter_EndNote","min": 0,"max": 127},
    shape: {"key": "E_CHOICE_VUMeter_Shape","choices": ["Circle","Filled Circle","Square","Filled Square","Diamond","Filled Diamond","Star","Filled Star","Tree","Filled Tree","Crucifix","Filled Crucifix","Present","Filled Present","Candy Cane","Snowflake","Heart","Filled Heart","SVG"]},
    bars: {"key": "E_SLIDER_VUMeter_Bars","min": 1,"max": 100},
    sensitivityPct: {"key": "E_SLIDER_VUMeter_Sensitivity","min": 0,"max": 100},
  },
  "Off": {
    transparent: {"key": "E_CHOICE_Off_Style","choices": ["Black","Transparent","Black -> Transparent","Transparent -> Black"]},
  },
  "Shimmer": {
    dutyFactor: {"key": "E_SLIDER_Shimmer_Duty_Factor","min": 1,"max": 100},
    cycleCount: {"key": "E_TEXTCTRL_Shimmer_Cycles","min": 0.0,"max": 600.0},
    useAllColors: {"key": "E_CHECKBOX_Shimmer_Use_All_Colors","boolean": true},
  },
  "Fill": {
    position: {"key": "E_SLIDER_Fill_Position","min": 0,"max": 100},
    bandSize: {"key": "E_SLIDER_Fill_Band_Size","min": 0,"max": 250},
    skipSize: {"key": "E_SLIDER_Fill_Skip_Size","min": 0,"max": 250},
    offset: {"key": "E_SLIDER_Fill_Offset","min": 0,"max": 100},
    changeColorOverTime: {"key": "E_CHECKBOX_Fill_Color_Time","boolean": true},
    direction: {"key": "E_CHOICE_Fill_Direction","choices": ["Up","Down","Left","Right"]},
  },
  "Snow Storm": {
    maxFlakes: {"key": "E_SLIDER_Snowstorm_Count","min": 0,"max": 100},
    trailLength: {"key": "E_SLIDER_Snowstorm_Length","min": 0,"max": 100},
    speed: {"key": "E_SLIDER_Snowstorm_Speed","min": 1,"max": 50},
  },
  "Life": {
    cellsToStart: {"key": "E_SLIDER_Life_Count","min": 0,"max": 100},
    type: {"key": "E_SLIDER_Life_Seed","min": 0,"max": 4},
    speed: {"key": "E_SLIDER_Life_Speed","min": 1,"max": 30},
  },
  "Lightning": {
    segments: {"key": "E_SLIDER_Number_Bolts","min": 1,"max": 50},
    boltWidth: {"key": "E_SLIDER_Number_Segments","min": 1,"max": 20},
    forked: {"key": "E_CHECKBOX_ForkedLightning","boolean": true},
    xMovement: {"key": "E_SLIDER_Lightning_BOTX","min": -50,"max": 50},
    direction: {"key": "E_CHOICE_Lightning_Direction","choices": ["Up","Down"]},
  },
  "Candle": {
    flameAgility: {"key": "E_TEXTCTRL_Candle_FlameAgility","min": 1,"max": 10},
    windBaseline: {"key": "E_TEXTCTRL_Candle_WindBaseline","min": 0,"max": 255},
    windVariability: {"key": "E_TEXTCTRL_Candle_WindVariability","min": 0,"max": 10},
    windCalmness: {"key": "E_TEXTCTRL_Candle_WindCalmness","min": 0,"max": 10},
    perNode: {"key": "E_CHECKBOX_PerNode","boolean": true},
  },
  "Lines": {
    lines: {"key": "E_SLIDER_Lines_Objects","min": 1,"max": 20},
    points: {"key": "E_SLIDER_Lines_Segments","min": 2,"max": 6},
    thickness: {"key": "E_SLIDER_Lines_Thickness","min": 1,"max": 10},
    speed: {"key": "E_TEXTCTRL_Lines_Speed","min": 0.0,"max": 10.0},
    tails: {"key": "E_SLIDER_Lines_Trails","min": 0,"max": 10},
    fadeTails: {"key": "E_CHECKBOX_Lines_FadeTrails","boolean": true},
  },
  "Spirograph": {
    speed: {"key": "E_SLIDER_Spirograph_Speed","min": 0,"max": 50},
    outerRadius: {"key": "E_SLIDER_Spirograph_R","min": 1,"max": 100},
    innerRadius: {"key": "E_SLIDER_Spirograph_r","min": 1,"max": 100},
    distance: {"key": "E_SLIDER_Spirograph_d","min": 1,"max": 100},
    animate: {"key": "E_TEXTCTRL_Spirograph_Animate","min": -50,"max": 50},
    length: {"key": "E_TEXTCTRL_Spirograph_Length","min": 0,"max": 50},
  },
  "Shape": {
    shape: {"key": "E_CHOICE_Shape_ObjectToDraw","choices": ["Circle","Ellipse","Triangle","Square","Pentagon","Hexagon","Octagon","Star","Heart","Tree","Snowflake","Candy Cane","Random","Crucifix","Present","Emoji","SVG"]},
    thickness: {"key": "E_SLIDER_Shape_Thickness","min": 1,"max": 100},
    count: {"key": "E_TEXTCTRL_Shape_Count","min": 1,"max": 100},
    startSize: {"key": "E_SLIDER_Shape_StartSize","min": 0,"max": 100},
    randomSizes: {"key": "E_CHECKBOX_Shape_RandomInitial","boolean": true},
    velocity: {"key": "E_SLIDER_Shapes_Velocity","min": 0,"max": 20},
    direction: {"key": "E_SLIDER_Shapes_Direction","min": 0,"max": 359},
    lifetime: {"key": "E_SLIDER_Shape_Lifetime","min": 1,"max": 100},
    growth: {"key": "E_SLIDER_Shape_Growth","min": -100,"max": 100},
    centerX: {"key": "E_SLIDER_Shape_CentreX","min": 0,"max": 100},
    centerY: {"key": "E_SLIDER_Shape_CentreY","min": 0,"max": 100},
    points: {"key": "E_SLIDER_Shape_Points","min": 2,"max": 9},
    rotation: {"key": "E_SLIDER_Shape_Rotation","min": 0,"max": 360},
    randomLocation: {"key": "E_CHECKBOX_Shape_RandomLocation","boolean": true},
    randomMovement: {"key": "E_CHECKBOX_Shapes_RandomMovement","boolean": true},
    fadeAway: {"key": "E_CHECKBOX_Shape_FadeAway","boolean": true},
  },
  "Fireworks": {
    explosions: {"key": "E_SLIDER_Fireworks_Explosions","min": 1,"max": 50},
    particles: {"key": "E_SLIDER_Fireworks_Count","min": 1,"max": 100},
    velocity: {"key": "E_SLIDER_Fireworks_Velocity","min": 1,"max": 10},
    gravity: {"key": "E_CHECKBOX_Fireworks_Gravity","boolean": true},
    particleFade: {"key": "E_SLIDER_Fireworks_Fade","min": 1,"max": 100},
    holdColor: {"key": "E_CHECKBOX_Fireworks_HoldColour","boolean": true},
    fireWithMusic: {"key": "E_CHECKBOX_Fireworks_UseMusic","boolean": true},
    triggerLevel: {"key": "E_SLIDER_Fireworks_Sensitivity","min": 0,"max": 100},
  },
  "Tree": {
    branches: {"key": "E_SLIDER_Tree_Branches","min": 1,"max": 10},
    speed: {"key": "E_SLIDER_Tree_Speed","min": 1,"max": 50},
    showTreeLights: {"key": "E_CHECKBOX_Tree_ShowLights","boolean": true},
  },
  "Morph": {
    x1a: {"key": "E_SLIDER_Morph_Start_X1","min": 0,"max": 100},
    y1a: {"key": "E_SLIDER_Morph_Start_Y1","min": 0,"max": 100},
    x1b: {"key": "E_SLIDER_Morph_Start_X2","min": 0,"max": 100},
    y1b: {"key": "E_SLIDER_Morph_Start_Y2","min": 0,"max": 100},
    x2a: {"key": "E_SLIDER_Morph_End_X1","min": 0,"max": 100},
    y2a: {"key": "E_SLIDER_Morph_End_Y1","min": 0,"max": 100},
    x2b: {"key": "E_SLIDER_Morph_End_X2","min": 0,"max": 100},
    y2b: {"key": "E_SLIDER_Morph_End_Y2","min": 0,"max": 100},
    headDuration: {"key": "E_SLIDER_MorphDuration","min": 0,"max": 100},
    acceleration: {"key": "E_SLIDER_MorphAccel","min": -10,"max": 10},
    repeatCount: {"key": "E_SLIDER_Morph_Repeat_Count","min": 0,"max": 250},
    repeatSkip: {"key": "E_SLIDER_Morph_Repeat_Skip","min": 1,"max": 100},
    stagger: {"key": "E_SLIDER_Morph_Stagger","min": -100,"max": 100},
    showHeadAtStart: {"key": "E_CHECKBOX_ShowHeadAtStart","boolean": true},
  },
  "Kaleidoscope": {
    type: {"key": "E_CHOICE_Kaleidoscope_Type","choices": ["Triangle","Square","Square 2","6-Fold","8-Fold","12-Fold","Radial"]},
    centerX: {"key": "E_SLIDER_Kaleidoscope_X","min": 0,"max": 100},
    centerY: {"key": "E_SLIDER_Kaleidoscope_Y","min": 0,"max": 100},
    size: {"key": "E_SLIDER_Kaleidoscope_Size","min": 2,"max": 100},
    rotation: {"key": "E_SLIDER_Kaleidoscope_Rotation","min": 0,"max": 359},
  },
  "Warp": {
    type: {"key": "E_CHOICE_Warp_Type","choices": ["water drops","dissolve","circle reveal","banded swirl","ripple","single water drop","circular swirl","drop","wavy","sample on","mirror","copy","flip","speed"]},
    treatment: {"key": "E_CHOICE_Warp_Treatment_APPLYLAST","choices": ["constant","in","out"]},
    x: {"key": "E_SLIDER_Warp_X","min": 0,"max": 100},
    y: {"key": "E_SLIDER_Warp_Y","min": 0,"max": 100},
    cycleCount: {"key": "E_TEXTCTRL_Warp_Cycle_Count","min": 1,"max": 10},
    speed: {"key": "E_TEXTCTRL_Warp_Speed","min": 0,"max": 40},
    frequency: {"key": "E_TEXTCTRL_Warp_Frequency","min": 0,"max": 40},
  },
  "Adjust": {
    mode: {"key": "E_CHOICE_Action","choices": ["None","Adjust By Value","Adjust By Percentage","Set Minimum","Set Maximum","Set Range","Shift With Wrap By Value","Prevent Range","Reverse"]},
  },
  "Sketch": {
    drawPercent: {"key": "E_SLIDER_DrawPercentage","min": 0,"max": 100},
    thickness: {"key": "E_SLIDER_Thickness","min": 1,"max": 25},
    motion: {"key": "E_CHECKBOX_MotionEnabled","boolean": true},
    motionPercent: {"key": "E_SLIDER_MotionPercentage","min": 1,"max": 100},
  },
  "State": {
    stateDefinition: {"key": "E_CHOICE_State_StateDefinition","choices": []},
    mode: {"key": "E_CHOICE_State_Mode","choices": ["Default","Countdown","Time Countdown","Number","Iterate"]},
    colorMode: {"key": "E_CHOICE_State_Color","choices": ["Graduate","Cycle","Allocate"]},
  },
  "Piano": {
    type: {"key": "E_CHOICE_Piano_Type","choices": ["True Piano","Bars"]},
    showSharps: {"key": "E_CHECKBOX_Piano_ShowSharps","boolean": true},
    verticalScalePct: {"key": "E_SLIDER_Piano_Scale","min": 0,"max": 100},
    horizontalOffsetPct: {"key": "E_SLIDER_Piano_XOffset","min": 0,"max": 100},
  },
  "Faces": {
    faceDefinition: {"key": "E_CHOICE_Faces_FaceDefinition","choices": []},
    showOutline: {"key": "E_CHECKBOX_Faces_Outline","boolean": true},
    suppressWhenNotSinging: {"key": "E_CHECKBOX_Faces_SuppressWhenNotSinging","boolean": true},
    fadeDuringLeadInOut: {"key": "E_CHECKBOX_Faces_Fade","boolean": true},
  },
  "Music": {
    bars: {"key": "E_SLIDER_Music_Bars","min": 1,"max": 100},
    type: {"key": "E_CHOICE_Music_Type","choices": ["Morph","Bounce","Collide","Separate","On"]},
    sensitivity: {"key": "E_SLIDER_Music_Sensitivity","min": 0,"max": 100},
    offset: {"key": "E_SLIDER_Music_Offset","min": 0,"max": 100},
    scaleBars: {"key": "E_CHECKBOX_Music_Scale","boolean": true},
    color: {"key": "E_CHOICE_Music_Colour","choices": ["Distinct","Blend","Cycle"]},
    fade: {"key": "E_CHECKBOX_Music_Fade","boolean": true},
    logarithmicX: {"key": "E_CHECKBOX_Music_LogarithmicX","boolean": true},
  },
  "Tendrils": {
    movement: {"key": "E_CHOICE_Tendril_Movement","choices": ["Random","Square","Circle","Horizontal Zig Zag","Horiz. Zig Zag Return","Vertical Zig Zag","Vert. Zig Zag Return","Music Line","Music Circle","Manual"]},
    tuneMovement: {"key": "E_TEXTCTRL_Tendril_TuneMovement","min": 0,"max": 20},
    thickness: {"key": "E_TEXTCTRL_Tendril_Thickness","min": 1,"max": 20},
    friction: {"key": "E_TEXTCTRL_Tendril_Friction","min": 0,"max": 20},
    dampening: {"key": "E_TEXTCTRL_Tendril_Dampening","min": 0,"max": 20},
    tension: {"key": "E_TEXTCTRL_Tendril_Tension","min": 0,"max": 39},
    trails: {"key": "E_TEXTCTRL_Tendril_Trails","min": 1,"max": 20},
    length: {"key": "E_TEXTCTRL_Tendril_Length","min": 5,"max": 100},
    speed: {"key": "E_TEXTCTRL_Tendril_Speed","min": 1,"max": 10},
    horizontalOffset: {"key": "E_TEXTCTRL_Tendril_XOffset","min": -100,"max": 100},
    verticalOffset: {"key": "E_TEXTCTRL_Tendril_YOffset","min": -100,"max": 100},
  },
  "Guitar": {
    type: {"key": "E_CHOICE_Guitar_Type","choices": ["Guitar","Bass Guitar","Banjo","Violin"]},
    timingTrack: {"key": "E_CHOICE_Guitar_MIDITrack_APPLYLAST","choices": []},
    stringAppearance: {"key": "E_CHOICE_StringAppearance","choices": ["On","Wave"]},
    fretCount: {"key": "E_SLIDER_MaxFrets","min": 8,"max": 30},
    baseWavelength: {"key": "E_TEXTCTRL_BaseWaveFactor","min": 0.1,"max": 10.0},
    varyWavelengthByString: {"key": "E_TEXTCTRL_StringWaveFactor","min": 0.0,"max": 10.0},
    fade: {"key": "E_CHECKBOX_Fade","boolean": true},
    collapse: {"key": "E_CHECKBOX_Collapse","boolean": true},
    showStrings: {"key": "E_CHECKBOX_ShowStrings","boolean": true},
  },
};

export interface XsqEffectSettings {
  name: string;
  settings: Record<string, string>;
  palette: Record<string, string>;
  warnings: string[];
}

const normalizeChoice = (value: string) => value.toLowerCase().replace(/[\s-]+/g, "");
const numberText = (value: number) => String(Number(value.toFixed(6)));
const hexChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");

/** Native editable settings; warnings describe every field that needs attention in xLights. */
export function exportEffectSettings(effect: SequenceEffect): XsqEffectSettings {
  const settings: Record<string, string> = {};
  const palette: Record<string, string> = {};
  const warnings: string[] = [];
  const warn = (message: string) => warnings.push(`${effect.name}: ${message}`);
  const known = Object.hasOwn(EFFECT_SCHEMAS, effect.name);
  const nativeName = effect.name === "Snow Storm" ? "Snowstorm" : effect.name === "Tendrils" ? "Tendril" : known ? effect.name : "Off";
  if (!known) warn("this effect is unavailable in xLights; an Off placeholder preserves its time and layer.");
  const mappings = PARAMS[effect.name] ?? {};
  const params = { ...defaultParamsFor(effect.name), ...effect.params };
  for (const [key, originalValue] of Object.entries(params)) {
    if (effect.name === "Circles" && key === "movement" && ["bounce", "radial", "none"].includes(String(originalValue))) continue;
    const mapping = mappings[key];
    if (!mapping) {
      warn(`the ${key} setting is not translated; configure it in xLights.`);
      continue;
    }
    let value: unknown = originalValue;
    if (isValueCurve(value)) {
      value = resolveParam(value, 0);
      warn(`${key} uses a value curve; its starting value is exported. Recreate the curve in xLights.`);
    }
    if (effect.name === "Off" && key === "transparent") value = value ? "Transparent" : "Black";
    if (effect.name === "Butterfly" && key === "reverse") value = value ? "Reverse" : "Normal";
    if (effect.name === "Wave" && key === "leftToRight") value = value ? "Left to Right" : "Right to Left";
    if (mapping.choices) {
      if (typeof value !== "string") { warn(`${key} has no compatible xLights choice.`); continue; }
      const match = mapping.choices.length === 0 ? value : mapping.choices.find((choice) => normalizeChoice(choice) === normalizeChoice(value as string));
      if (match === undefined) { warn(`${key} choice ${value} is unavailable in xLights.`); continue; }
      settings[mapping.key] = match;
    } else if (mapping.boolean) {
      if (typeof value !== "boolean") { warn(`${key} has no compatible xLights checkbox value.`); continue; }
      settings[mapping.key] = value ? "1" : "0";
    } else if (typeof value === "number" && Number.isFinite(value)) {
      const scaled = value * (mapping.scale ?? 1);
      const limited = Math.max(mapping.min ?? -Infinity, Math.min(mapping.max ?? Infinity, scaled));
      if (scaled !== limited) warn(`${key} is outside xLights' range and was limited to ${numberText(limited)}.`);
      settings[mapping.key] = numberText(limited);
    } else if (typeof value === "string") {
      settings[mapping.key] = value;
    } else warn(`${key} cannot be translated; configure it in xLights.`);
  }
  // The web engine implements this specific SingleStrand variant, not the native default tab.
  if (effect.name === "SingleStrand") Object.assign(settings, {
    E_NOTEBOOK_SSEFFECT_TYPE: "Chase", E_CHOICE_SingleStrand_Colors: "Palette",
    E_SLIDER_Number_Chases: "1", E_CHOICE_Chase_Type1: "Left-Right", E_CHOICE_Fade_Type: "None",
  });
  if (effect.name === "Pictures" || effect.name === "Shader") {
    settings.X_Effect_RenderDisabled = "True";
    warn("the image or shader asset is not included. This effect is disabled until its file is selected in xLights.");
  }
  if (effect.name === "Text") {
    settings.E_CHOICE_Text_Font = "5-5x5 Thin";
    warn("the built-in web font and text positioning may look different in xLights.");
  }
  if (effect.name === "Circles") {
    const movement = String(params.movement ?? "bounce");
    settings.E_CHECKBOX_Circles_Bounce = movement === "bounce" ? "1" : "0";
    settings.E_CHECKBOX_Circles_Radial = movement === "radial" ? "1" : "0";
  }

  const swatches = effect.palette?.length ? effect.palette : DEFAULT_PALETTE_HEX;
  if (swatches.length > 8) warn("xLights supports eight palette slots; additional colors are omitted.");
  swatches.slice(0, 8).forEach((swatch, i) => {
    const id = i + 1;
    palette[`C_CHECKBOX_Palette${id}`] = "1";
    if (typeof swatch === "string") palette[`C_BUTTON_Palette${id}`] = swatch;
    else if (isColorCurve(swatch)) {
      const direction = { "Left to Right": 1, "Top to Bottom": 2, "Right to Left": 3, "Bottom to Top": 4 };
      const timecurve = swatch.mode === "Spatial" ? direction[swatch.direction ?? "Left to Right"] : 0;
      const points = [...swatch.points].sort((a, b) => a.x - b.x);
      palette[`C_BUTTON_Palette${id}`] = `Active=TRUE|Id=ID_BUTTON_Palette${id}|Type=${swatch.blend}|Timecurve=${timecurve}|Values=${points.map((p) => `x=${numberText(p.x)}^c=${p.color}`).join(";")}|`;
      if (timecurve !== 0) warn("spatial palette curves depend on the native effect's spatial-color support; verify them in xLights.");
    }
  });
  const color = effect.colorAdjust;
  if (color) {
    palette.C_SLIDER_Brightness = numberText(100 + (color.brightness ?? 0));
    palette.C_SLIDER_Contrast = numberText(color.contrast ?? 0);
    palette.C_SLIDER_SparkleFrequency = numberText(color.sparkles ?? 0);
    if (color.sparkleColor) palette.C_COLOURPICKERCTRL_SparklesColour = `#${hexChannel(color.sparkleColor.r)}${hexChannel(color.sparkleColor.g)}${hexChannel(color.sparkleColor.b)}`;
    if ((color.contrast ?? 0) > 0 || (color.sparkles ?? 0) > 0) warn("contrast and sparkles use xLights' native rendering and may look different.");
  }
  const blend = effect.blendMode ?? "Normal";
  settings.T_CHOICE_LayerMethod = blend === "Morph" || blend === "Canvas" ? "Normal" : blend;
  const webMix = effect.mix ?? 0;
  const nativeMix = blend === "Effect 1" || blend === "Effect 2" ? 1 - webMix : webMix;
  settings.T_SLIDER_EffectLayerMix = numberText(nativeMix * 100);
  if (blend !== "Normal" && blend !== "Canvas" && blend !== "Morph") warn("layer blending uses xLights' native compositing and may look different.");
  if (blend === "Morph") { settings.T_CHECKBOX_LayerMorph = "1"; warn("Morph uses xLights' native easing and may look different."); }
  if (blend === "Canvas") {
    settings.T_CHECKBOX_Canvas = "1";
    // Relative zero-based offsets refer to all lower layers after the writer reverses our order.
    settings.T_LayersSelected = Array.from({ length: effect.layerIndex ?? 0 }, (_, i) => i).join("|");
  }
  const transition = effect.transition;
  for (const side of ["in", "out"] as const) {
    const duration = transition?.[`${side}DurationMs`] ?? 0;
    if (duration <= 0) continue;
    const title = side === "in" ? "In" : "Out";
    const type = transition?.[`${side}Type`] ?? "Fade";
    const nativeTransitions = ["Fade", "Wipe", "Clock", "From Middle", "Square Explode", "Circle Explode", "Blinds", "Slide Bars", "Bow Tie", "Star"];
    const nativeType = nativeTransitions.includes(type) ? type : "Fade";
    if (nativeType !== type) warn(`${side} transition ${type} is replaced with Fade; recreate the transition in xLights.`);
    else if (type !== "Fade") warn(`${type} transitions use xLights' native rendering and may look different.`);
    settings[`T_TEXTCTRL_Fade${side}`] = numberText(duration / 1000);
    settings[`T_CHOICE_${title}_Transition_Type`] = nativeType;
    settings[`T_SLIDER_${title}_Transition_Adjust`] = numberText(transition?.[`${side}Adjust`] ?? 50);
    settings[`T_CHECKBOX_${title}_Transition_Reverse`] = transition?.[`${side}Reverse`] ? "1" : "0";
  }
  const layer = effect.layer;
  if (layer) {
    if (layer.renderStyle) settings.B_CHOICE_BufferStyle = layer.renderStyle;
    if (layer.transform) settings.B_CHOICE_BufferTransform = layer.transform;
    if (layer.blur !== undefined) {
      settings.B_SLIDER_Blur = numberText(layer.blur);
      if (layer.blur > 1) warn("blur uses xLights' native filter and may look different.");
    }
    if (layer.persistent !== undefined) settings.B_CHECKBOX_OverlayBkg = layer.persistent ? "1" : "0";
    if (layer.suppressUntilFrame !== undefined) settings.B_SPINCTRL_SuppressEffectUntil = String(layer.suppressUntilFrame);
    if (layer.freezeAtFrame !== undefined) settings.B_SPINCTRL_FreezeEffectAtFrame = String(layer.freezeAtFrame);
    if (layer.subBuffer) settings.B_CUSTOM_SubBuffer = [layer.subBuffer.x1, layer.subBuffer.y1, layer.subBuffer.x2, layer.subBuffer.y2].map(numberText).join("x");
    if (layer.rotoZoom) {
      const rz = layer.rotoZoom;
      settings.B_SLIDER_Rotation = numberText((((rz.rotation ?? 0) % 360) + 360) % 360 / 3.6);
      settings.B_SLIDER_Zoom = numberText((rz.zoom ?? 1) * 10);
      settings.B_SLIDER_PivotPointX = numberText(rz.pivotX ?? 50);
      settings.B_SLIDER_PivotPointY = numberText(rz.pivotY ?? 50);
      warn("Roto-Zoom uses xLights' native sampling and may look different.");
    }
  }
  return { name: nativeName, settings, palette, warnings: [...new Set(warnings)] };
}
