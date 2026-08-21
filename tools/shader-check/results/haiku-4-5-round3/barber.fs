/*{
  "DESCRIPTION": "A spinning barber pole with diagonal stripes rotating continuously",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripeCount", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 6.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Center the coordinate system
  vec2 centered = uv - vec2(0.5, 0.5);
  
  // Convert to polar coordinates
  float angle = atan(centered.y, centered.x) + TIME * speed * 2.0;
  float radius = length(centered);
  
  // Create diagonal stripes along the rotation
  float stripes = mod(angle + radius * stripeCount * 6.28318, 6.28318);
  float stripe = mod(floor(stripes / (6.28318 / stripeCount)), 3.0);
  
  // Select color based on stripe index
  vec3 color;
  if (stripe < 1.0) {
    color = colorA.rgb;
  } else if (stripe < 2.0) {
    color = colorB.rgb;
  } else {
    color = colorC.rgb;
  }
  
  gl_FragColor = vec4(color, 1.0);
}
