/*{
  "DESCRIPTION": "A sunrise glow slowly rising from the bottom of the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorLow", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.0, 1.0] },
    { "NAME": "colorMid", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.2, 1.0] },
    { "NAME": "colorHigh", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.8, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  float horizon = mod(TIME * speed * 0.3, 2.0);
  if (horizon > 1.0) {
    horizon = 2.0 - horizon;
  }
  
  float riseHeight = -0.3 + horizon * 1.3;
  float distFromHorizon = uv.y - riseHeight;
  
  float glow = smoothstep(-0.4, 0.6, distFromHorizon);
  float topGradient = smoothstep(0.0, 0.8, distFromHorizon);
  
  vec3 color = mix(colorLow.rgb, colorMid.rgb, glow);
  color = mix(color, colorHigh.rgb, topGradient * 0.6);
  
  float brightness = mix(0.3, 1.0, glow);
  color = color * brightness;
  
  gl_FragColor = vec4(color, 1.0);
}
