/*{
  "DESCRIPTION": "A sunrise slowly rising from the bottom of the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorHorizon", "TYPE": "color", "DEFAULT": [1.0, 0.5, 0.0, 1.0] },
    { "NAME": "colorSky", "TYPE": "color", "DEFAULT": [0.2, 0.4, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  float sunriseHeight = mod(TIME * speed * 0.25, 2.0);
  if (sunriseHeight > 1.0) {
    sunriseHeight = 2.0 - sunriseHeight;
  }
  
  float distanceFromBottom = uv.y;
  float horizonPos = sunriseHeight * 0.6;
  
  float blend = smoothstep(horizonPos - 0.3, horizonPos + 0.3, distanceFromBottom);
  
  vec3 finalColor = mix(colorHorizon.rgb, colorSky.rgb, blend);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
