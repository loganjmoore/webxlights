/*{
  "DESCRIPTION": "A sunrise slowly rising from the bottom of the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorSky", "TYPE": "color", "DEFAULT": [0.1, 0.2, 0.4, 1.0] },
    { "NAME": "colorHorizon", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.2, 1.0] },
    { "NAME": "colorSun", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 0.5 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float sunriseHeight = mod(TIME * speed * 0.1, 2.0);
  if (sunriseHeight > 1.0) {
    sunriseHeight = 2.0 - sunriseHeight;
  }
  
  float sunY = sunriseHeight - 0.3;
  float distToSun = length(vec2(uv.x - 0.5, uv.y - sunY) * vec2(1.0, 2.0));
  float sunGlow = exp(-distToSun * distToSun * 8.0);
  
  float horizonSharpness = 3.0;
  float horizonDist = smoothstep(sunriseHeight + 0.15, sunriseHeight - 0.15, uv.y);
  
  vec3 color = mix(colorSky.rgb, colorHorizon.rgb, horizonDist);
  color = mix(color, colorSun.rgb, sunGlow * 0.9);
  
  gl_FragColor = vec4(color, 1.0);
}
