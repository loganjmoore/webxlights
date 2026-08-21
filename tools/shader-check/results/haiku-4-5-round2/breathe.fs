/*{
  "DESCRIPTION": "Slow breathing glow that pulses smoothly across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "glowColor", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "breathRate", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.0 },
    { "NAME": "minBrightness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.2 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float breathe = sin(TIME * breathRate * 0.5) * 0.5 + 0.5;
  breathe = mix(minBrightness, 1.0, breathe);
  
  float distance = length(uv - vec2(0.5, 0.5));
  float glow = exp(-distance * distance * 3.0);
  
  float intensity = glow * breathe;
  
  gl_FragColor = vec4(glowColor.rgb * intensity, 1.0);
}
