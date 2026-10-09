import pytest
from backend.app.consumer.landmarks import landmark_repo, haversine_distance_m
from backend.app.consumer.rerouting import reroute_engine, RerouteTrigger
from backend.app.consumer.assistant import voice_assistant, AssistantQueryRequest
from backend.app.api.consumer_routes import query_osrm_route


def test_landmark_repository():
    landmarks = landmark_repo.list_all()
    assert len(landmarks) >= 10

    # Verify seed landmarks exist in Hyderabad
    names = [lm.name for lm in landmarks]
    assert any("Karachi Bakery" in n for n in names)
    assert any("Blue Iron Gate" in n for n in names)
    assert any("Ratnadeep" in n for n in names)

    # Test adding a user-submitted landmark
    new_lm = landmark_repo.add_landmark(
        name="Chaiwala Yellow Kiosk",
        category="tea_stall",
        visual_cue="Bright canary-yellow shed with steaming brass kettle",
        description="Opposite Metro Pillar 1230",
        lat=17.4485,
        lng=78.3820,
        tags=["tea", "meeting_point"]
    )
    assert new_lm.is_user_submitted is True
    assert landmark_repo.get_by_id(new_lm.id) is not None


def test_landmark_maneuver_blending():
    raw_maneuvers = [
        {
            "instruction": "Turn left onto Madhapur 100ft Road",
            "type": "turn",
            "modifier": "left",
            "street_name": "Madhapur 100ft Road",
            "location": [78.3885, 17.4478]  # At The Blue Iron Gate
        },
        {
            "instruction": "Continue onto Cyber Towers Road",
            "type": "continue",
            "modifier": "straight",
            "street_name": "Cyber Towers Road",
            "location": [78.3811, 17.4504]  # Near Karachi Bakery
        }
    ]

    enriched = landmark_repo.blend_landmarks_into_maneuvers(raw_maneuvers)
    assert len(enriched) == 2

    # Step 1 should reference the Blue Iron Gate
    step1 = enriched[0]
    assert "Blue Iron Gate" in step1["instruction"]
    assert step1["landmark"] is not None
    assert step1["landmark"]["name"] == "The Blue Iron Gate Compound"

    # Step 2 should reference Karachi Bakery
    step2 = enriched[1]
    assert "Karachi Bakery" in step2["instruction"]


def test_explainable_rerouting():
    trigger = RerouteTrigger(
        trigger_type="accident",
        location_name="HITEC City Main Road",
        distance_ahead_m=800,
        delay_added_sec=720,  # 12 min delay
        time_saved_sec=360,   # saves 6 min
        alternative_corridor="Mindspace bypass"
    )

    exp = reroute_engine.generate_explanation(trigger)
    assert "accident reported 800m ahead" in exp.explanation
    assert "saves 6 minutes" in exp.explanation
    assert exp.time_saved_min == 6
    assert exp.delay_avoided_min == 12

    # Test monsoon waterlogging trigger
    trigger_water = RerouteTrigger(
        trigger_type="waterlogging",
        location_name="Jubilee Hills Road 36 Underpass",
        distance_ahead_m=500,
        delay_added_sec=900,
        time_saved_sec=480,
        alternative_corridor="Durgam Cheruvu Cable Bridge"
    )
    exp_water = reroute_engine.generate_explanation(trigger_water)
    assert "waterlogging" in exp_water.explanation
    assert "saves 8 minutes" in exp_water.explanation


def test_voice_assistant_corridor_search():
    # 1. Test clean restroom en-route query
    req = AssistantQueryRequest(
        query="Find me a petrol pump with a clean restroom on the way",
        current_lat=17.4483,
        current_lng=78.3808,
        active_route_coords=[[78.3808, 17.4483], [78.3775, 17.4518], [78.4061, 17.4332]]
    )

    res = voice_assistant.process_voice_query(req)
    assert res.intent in ["en_route_stop", "find_place"]
    assert "clean_restroom" in res.constraints
    assert res.card is not None
    assert res.card.category in ["Petrol Pump", "Shop"]
    assert "clean restroom" in res.voice_response.lower()
    assert res.card.detour_minutes >= 0

    # 2. Test pure vegetarian query
    req_veg = AssistantQueryRequest(
        query="Is there a pure vegetarian restaurant near Madhapur?",
        current_lat=17.4483,
        current_lng=78.3808
    )
    res_veg = voice_assistant.process_voice_query(req_veg)
    assert "vegetarian" in res_veg.constraints
    assert res_veg.card is not None
    assert any("Vegetarian" in f for f in res_veg.card.features)


def test_osrm_consumer_routing():
    # Route between Cyber Towers and Jubilee Hills Check Post
    waypoints = [[78.3811, 17.4504], [78.4072, 17.4318]]
    geojson, maneuvers, dist_km, dur_min = query_osrm_route(waypoints)

    assert geojson["type"] == "LineString"
    assert len(geojson["coordinates"]) >= 2
    assert dist_km > 0
    assert dur_min > 0
    assert len(maneuvers) >= 1
